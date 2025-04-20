import React, { useState, useRef, useEffect } from "react";
import "./App.css";

const DEFAULT_DESCRIPTION_PROMPT = `Analyze the provided image in detail. Imagine this as a frame in a movie. Objectively and accurately describe whats in the image. Imagine the next scene, in the same style, with the same object, but with an absurd, wild twist - taking it in a whole new direction.`;

function Block({ block, onExpandImage }) {
  return (
    <div className={`block block-${block.type} ${block.status}`}> 
      <div className="block-header">{block.type.toUpperCase()}</div>
      <div className="block-content">
        {block.type === "image" && block.content && !block.content.startsWith("Gen") ? (
          <img src={block.content} alt="Generated" style={{ maxWidth: 180, maxHeight: 180, borderRadius: 8 }} onClick={() => onExpandImage(block.content)} />
        ) : (
          <pre>{block.content}</pre>
        )}
      </div>
      <div className={`block-status ${block.status}`}>{block.status}</div>
    </div>
  );
}

function PromptCard({ label, value, onChange, onSet }) {
  return (
    <div className="prompt-card">
      <label className="prompt-card-label">{label}</label>
      <textarea
        className="prompt-card-textarea"
        value={value}
        onChange={e => onChange(e.target.value)}
        rows={4}
      />
      <button className="prompt-card-set" onClick={onSet}>✔️ Set & Save Template</button>
    </div>
  );
}

const ENV_API_KEY = import.meta.env.VITE_OPEN_API_KEY || "";
console.log("TEST VAR", import.meta.env.VITE_TEST_VAR);

export default function App() {
  const [prompt, setPrompt] = useState("");
  const [loops, setLoops] = useState("infinite");
  const [model, setModel] = useState("gpt-4o");
  const [imageModel, setImageModel] = useState("dall-e-3");
  const [running, setRunning] = useState(false);
  const [loopCount, setLoopCount] = useState(0);
  const [history, setHistory] = useState([]); 
  const [debugLog, setDebugLog] = useState([]);
  const [awaiting, setAwaiting] = useState(false);
  const [error, setError] = useState("");
  const [showPromptLibrary, setShowPromptLibrary] = useState(false);
  const [expandedImage, setExpandedImage] = useState(null);
  const [style, setStyle] = useState("cinematic");
  const loopRef = useRef();

  const [promptCards, setPromptCards] = useState([
    ''
  ]);

  const [descriptionPromptTemplate, setDescriptionPromptTemplate] = useState(() => {
    const stored = localStorage.getItem('ACTIVE_LOOP_PROMPTS');
    return typeof stored === 'string' && stored.trim() !== '' ? stored : DEFAULT_DESCRIPTION_PROMPT;
  });

  useEffect(() => {
    if (showPromptLibrary) {
      setPromptCards([descriptionPromptTemplate]);
    }
  }, [showPromptLibrary, descriptionPromptTemplate]);

  const setDescriptionTemplate = () => {
    const newTemplate = promptCards[0]; 
    if (!newTemplate.trim()) return; 
    setDescriptionPromptTemplate(newTemplate);
    localStorage.setItem('ACTIVE_LOOP_PROMPTS', newTemplate);
  };

  const log = (msg) => {
    setDebugLog((log) => [...log.slice(-49), `[${new Date().toLocaleTimeString()}] ${msg}`]);
  };

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
          model: "gpt-4o", 
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: descriptionPromptTemplate },
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

  async function runLoop() {
    setRunning(true);
    setLoopCount(0);
    setHistory([]); 
    setError("");
    setDebugLog(["Starting loop..."]);
    let count = 0;
    let currentImage = null; 
    let currentDescription = null; 
    let isFirstIteration = true;

    loopRef.current = true;
    try {
      while (loopRef.current && (loops === "infinite" || count < parseInt(loops))) {
        setAwaiting(true);
        log(`Loop ${count + 1}: Starting iteration...`);

        if (isFirstIteration) {
          const initialImagePrompt = `Generate an image, like in a movie scene with ${prompt} in the style of ${style}`;
          log(`Generating initial image: ${initialImagePrompt}`);
          try {
            currentImage = await generateImage(initialImagePrompt);
            setHistory((h) => [...h, { type: "image", content: currentImage, status: "done" }]);
            log("Initial image generated.");
          } catch (e) {
            setError(`Failed initial image generation: ${e}`);
            setHistory((h) => [...h, { type: "image", content: `Error generating initial image: ${e}`, status: "error" }]);
            loopRef.current = false; 
            break;
          }
          isFirstIteration = false;
        } else {
          if (!currentDescription) {
            setError("Error: No description available to generate next image.");
            loopRef.current = false;
            break;
          }
          const nextImagePrompt = `Generate an image of as the next frame in a movie or comic. ${currentDescription}`;
          log(`Generating next image from description...`); 
          try {
            currentImage = await generateImage(nextImagePrompt); 
            setHistory((h) => [...h, { type: "image", content: currentImage, status: "done" }]);
            log("Next image generated.");
          } catch (e) {
            setError(`Failed next image generation: ${e}`);
            setHistory((h) => [...h, { type: "image", content: `Error generating next image: ${e}`, status: "error" }]);
            loopRef.current = false;
            break;
          }
        }

        if (!currentImage) {
          setError("Error: No image available to describe.");
          loopRef.current = false;
          break;
        }
        log(`Requesting description for the latest image...`); 
        try {
          currentDescription = await describeImage(currentImage); 
          setHistory((h) => [...h, { type: "description", content: currentDescription, status: "done" }]);
          log("Description generated.");
        } catch (e) {
          setError(`Failed description: ${e}`);
          setHistory((h) => [...h, { type: "description", content: `Error generating description: ${e}`, status: "error" }]);
          loopRef.current = false;
          break;
        }

        setAwaiting(false);
        log(`Loop ${count + 1}: Iteration complete.`);
        count++;
        setLoopCount(count);
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
              placeholder="Enter initial prompt..."
            />
            <input
              type="text"
              className="style-input"
              value={style}
              onChange={e => setStyle(e.target.value)}
              placeholder="Style (e.g., cinematic, watercolor)..."
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
            <div className="prompt-library-cards">
              {promptCards.slice(0, 1).map((val, i) => ( 
                <PromptCard
                  key={i}
                  label="Describe Image & Twist Template" 
                  value={val}
                  onChange={v => setPromptCards([v])} 
                  onSet={setDescriptionTemplate} 
                />
              ))}
            </div>
            <button className="prompt-library-close" onClick={() => setShowPromptLibrary(false)}>Close</button>
            <div style={{marginTop:'1.1rem',fontSize:'0.97rem',color:'#bfc9d1'}}>
              (These placeholders are handled internally in the fixed prompts.)
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
                  <Block block={block} onExpandImage={setExpandedImage} />
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
        {expandedImage && (
          <div style={{position:'fixed',top:0,left:0,width:'100vw',height:'100vh',background:'rgba(0,0,0,0.8)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center'}} onClick={()=>setExpandedImage(null)}>
            <img src={expandedImage} alt="Expanded" style={{maxWidth:'90vw',maxHeight:'90vh',border:'4px solid #60a5fa',background:'#23262f'}} />
          </div>
        )}
      </div>
    </div>
  );
}
