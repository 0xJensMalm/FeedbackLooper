import React, { useState, useRef } from "react";
import "./App.css";

const PROMPT_LIBRARY = [
  "A futuristic cityscape at sunset",
  "A wise old tree stump wizard",
  "A robot painting a self-portrait",
  "A surreal underwater library",
  "A dragon reading a book to children"
];

// Loop prompt templates for each step
const LOOP_PROMPTS = [
  "Generate an image of [initial prompt]",
  "Describe the image in an epic 3 paragraph short story, add an absurd twist in the last paragraph",
  "Generate an image of [last description]"
];

function Block({ block }) {
  return (
    <div className={`block block-${block.type} ${block.status}`}> 
      <div className="block-header">{block.type.toUpperCase()}</div>
      <div className="block-content">
        {block.type === "image" && block.content && !block.content.startsWith("Gen") ? (
          <img src={block.content} alt="Generated" style={{ maxWidth: 180, maxHeight: 180, borderRadius: 8 }} />
        ) : (
          <pre>{block.content}</pre>
        )}
      </div>
      <div className={`block-status ${block.status}`}>{block.status}</div>
    </div>
  );
}

const ENV_API_KEY = import.meta.env.VITE_OPEN_API_KEY || "";
//console.log("API KEY", ENV_API_KEY);
console.log("TEST VAR", import.meta.env.VITE_TEST_VAR);

export default function App() {
  // UI State
  const [prompt, setPrompt] = useState(PROMPT_LIBRARY[0]);
  const [loops, setLoops] = useState("infinite");
  const [model, setModel] = useState("gpt-4o");
  const [imageModel, setImageModel] = useState("dall-e-3");
  const [running, setRunning] = useState(false);
  const [loopCount, setLoopCount] = useState(0);
  const [history, setHistory] = useState([]); // Each block: {type, content, status}
  const [debugLog, setDebugLog] = useState([]);
  const [awaiting, setAwaiting] = useState(false);
  const [error, setError] = useState("");
  const [showPromptLibrary, setShowPromptLibrary] = useState(false);
  const loopRef = useRef();

  // Add log entry
  const log = (msg) => {
    setDebugLog((log) => [...log.slice(-49), `[${new Date().toLocaleTimeString()}] ${msg}`]);
  };

  // OpenAI API call helpers
  async function generateImage(prompt) {
    log("Requesting image from OpenAI...");
    try {
      const res = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${ENV_API_KEY}`
        },
        body: JSON.stringify({
          model: imageModel,
          prompt,
          n: 1,
          size: "1024x1024"
        })
      });
      if (!res.ok) throw new Error(`Image API error: ${res.status}`);
      const data = await res.json();
      log("Image received from OpenAI.");
      return data.data[0].url;
    } catch (e) {
      setError(e.message);
      log(`Image generation failed: ${e.message}`);
      throw e;
    }
  }

  async function describeImage(imageUrl) {
    log("Requesting description from OpenAI Vision...");
    try {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${ENV_API_KEY}`
        },
        body: JSON.stringify({
          model: "gpt-4o", // Use gpt-4o for vision
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: "Describe this image in 3 epic paragraphs, with an absurd twist in the last paragraph." },
                { type: "image_url", image_url: { url: imageUrl } }
              ]
            }
          ],
          max_tokens: 600
        })
      });
      if (!res.ok) throw new Error(`Vision API error: ${res.status}`);
      const data = await res.json();
      log("Description received from OpenAI.");
      return data.choices[0].message.content;
    } catch (e) {
      setError(e.message);
      log(`Description failed: ${e.message}`);
      throw e;
    }
  }

  // Main loop
  async function runLoop() {
    setRunning(true);
    setLoopCount(0);
    setDebugLog([]);
    setError("");
    setHistory([]);
    let count = 0;
    let currentPrompt = prompt;
    loopRef.current = true;
    try {
      while (loopRef.current && (loops === "infinite" || count < parseInt(loops))) {
        // 1. Add prompt block
        setHistory((h) => [
          ...h,
          { type: "prompt", content: currentPrompt, status: "done" }
        ]);
        log(`Loop ${count + 1}: Generating image for prompt: ${currentPrompt}`);
        setAwaiting(true);
        let image;
        try {
          setHistory((h) => [
            ...h,
            { type: "image", content: "Generating...", status: "loading" }
          ]);
          image = await generateImage(currentPrompt);
          setHistory((h) => {
            const idx = h.findLastIndex(b => b.type === "image" && b.status === "loading");
            if (idx >= 0) h[idx] = { ...h[idx], content: image, status: "done" };
            return [...h];
          });
        } catch {
          setHistory((h) => {
            const idx = h.findLastIndex(b => b.type === "image" && b.status === "loading");
            if (idx >= 0) h[idx] = { ...h[idx], status: "error" };
            return [...h];
          });
          setAwaiting(false);
          break;
        }
        log(`Loop ${count + 1}: Describing image...`);
        setHistory((h) => [
          ...h,
          { type: "description", content: "Describing...", status: "loading" }
        ]);
        let desc;
        try {
          desc = await describeImage(image);
          setHistory((h) => {
            const idx = h.findLastIndex(b => b.type === "description" && b.status === "loading");
            if (idx >= 0) h[idx] = { ...h[idx], content: desc, status: "done" };
            return [...h];
          });
        } catch {
          setHistory((h) => {
            const idx = h.findLastIndex(b => b.type === "description" && b.status === "loading");
            if (idx >= 0) h[idx] = { ...h[idx], status: "error" };
            return [...h];
          });
          setAwaiting(false);
          break;
        }
        setAwaiting(false);
        log(`Loop ${count + 1}: Success!`);
        count++;
        setLoopCount(count);
        currentPrompt = desc;
        await new Promise((r) => setTimeout(r, 500));
      }
    } finally {
      setRunning(false);
      setAwaiting(false);
      log("Loop stopped.");
    }
  }

  function stopLoop() {
    loopRef.current = false;
    setRunning(false);
    setAwaiting(false);
    log("User stopped the loop.");
  }

  return (
    <div className="app-outer dark">
      <div className="main-flex">
        <div className="input-block">
          <div className="input-row wide">
            <input
              type="text"
              className="prompt-input"
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              placeholder="Enter prompt..."
            />
            <button className="prompt-library-btn" onClick={() => setShowPromptLibrary(v => !v)}>
              Loop Prompts
            </button>
          </div>
          <div className="input-row wide">
            <div className="input-group">
              <label>Loops</label>
              <button className="loop-btn" onClick={() => setLoops(l => l === "infinite" ? 1 : Math.max(1, +l-1))}>-</button>
              <input
                type="text"
                className="loop-input"
                value={loops}
                onChange={e => setLoops(e.target.value)}
              />
              <button className="loop-btn" onClick={() => setLoops(l => l === "infinite" ? 2 : l === "" ? 1 : +l+1)}>+</button>
              <button className="loop-btn" onClick={() => setLoops("infinite")}>∞</button>
            </div>
            <div className="input-group">
              <label>Text Model</label>
              <select className="model-select" value={model} onChange={e => setModel(e.target.value)}>
                <option value="gpt-4o">gpt-4o</option>
                <option value="gpt-4-vision-preview">gpt-4-vision-preview</option>
              </select>
            </div>
            <div className="input-group">
              <label>Image Model</label>
              <select className="model-select" value={imageModel} onChange={e => setImageModel(e.target.value)}>
                <option value="dall-e-3">dall-e-3</option>
              </select>
            </div>
            <button className="start-btn" disabled={running} onClick={runLoop}>Start</button>
            <button className="stop-btn" disabled={!running} onClick={stopLoop}>Stop</button>
          </div>
        </div>
        {showPromptLibrary && (
          <div className="prompt-library-modal">
            <div className="prompt-library-header">
              <span>Loop Prompts</span>
              <button className="close-btn" onClick={() => setShowPromptLibrary(false)}>×</button>
            </div>
            <ul>
              {LOOP_PROMPTS.map((p, i) => (
                <li key={i} style={{cursor:'default',color:'#e5e7eb',fontWeight:600,padding:'0.35rem 0.5rem'}}>{p}</li>
              ))}
            </ul>
            <div style={{marginTop:'1.1rem',fontSize:'0.97rem',color:'#bfc9d1'}}>
              <b>[initial prompt]</b> is the prompt you enter above.<br/>
              <b>[last description]</b> is the output from the previous description step.<br/>
              These steps repeat endlessly.
            </div>
          </div>
        )}
        <div className="blockchain-panel fitted">
          <div className="blockchain-scroll">
            {history.length === 0 ? (
              <div className="block-placeholder">Start the loop to see the blockchain visualization.</div>
            ) : (
              history.map((block, i) => (
                <React.Fragment key={i}>
                  <Block block={block} />
                  {i < history.length - 1 && <span className="block-arrow">→</span>}
                </React.Fragment>
              ))
            )}
          </div>
        </div>
        <div className="panel debug-panel">
          <strong>Debugger Log:</strong>
          <pre style={{ maxHeight: 220, overflowY: "auto", fontSize: 13, background: "#222831", color: '#eee' }}>
            {debugLog.join("\n")}
          </pre>
        </div>
      </div>
    </div>
  );
}
