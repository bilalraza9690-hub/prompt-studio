const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.GEMINI_API_KEY;

app.use(express.json({limit:"15mb"}));
app.use(express.static(__dirname));

function requireKey(res){
  if(!API_KEY){
    res.status(500).json({error:"GEMINI_API_KEY is not configured on the server."});
    return false;
  }
  return true;
}

function ratioValue(r){
  if(r==="9:16 Vertical") return "9:16";
  if(r==="16:9 Landscape") return "16:9";
  return "1:1";
}

app.post("/api/prompt", async (req,res)=>{
  if(!requireKey(res)) return;

  const {
    idea,
    type="Video Prompt",
    style="Cinematic",
    ratio="9:16 Vertical",
    count=1
  }=req.body;

  if(!idea) return res.status(400).json({error:"Idea is required."});

  const instruction = `You are Prompt Studio AI. Create ${count} distinct, copy-ready ${type} prompts from this idea:
${idea}
Style: ${style}
Aspect ratio: ${ratio}
Make each prompt detailed, visual, original and suitable for an AI generation model. Include subject, environment, action, camera, lighting, composition, materials/texture and motion when relevant. Keep characters consistent. Add a concise negative prompt where useful. Return only a numbered list of prompts.`;

  try{
    const r=await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent",{
      method:"POST",
      headers:{
        "x-goog-api-key":API_KEY,
        "Content-Type":"application/json"
      },
      body:JSON.stringify({
        contents:[{
          parts:[{text:instruction}]
        }]
      })
    });

    const data=await r.json();

    if(!r.ok)
      return res.status(r.status).json({
        error:data.error?.message||"Gemini error"
      });

    const text=data.candidates?.[0]?.content?.parts
      ?.map(p=>p.text||"").join("")||"";

    res.json({text});

  }catch(e){
    res.status(500).json({error:e.message});
  }
});

   app.post("/api/image", async (req,res)=>{
  const {
    prompt,
    ratio="9:16 Vertical"
  } = req.body;

  if(!prompt)
    return res.status(400).json({
      error:"Prompt is required."
    });

  const POLL_KEY = process.env.POLLINATIONS_API_KEY;

  if(!POLL_KEY)
    return res.status(500).json({
      error:"POLLINATIONS_API_KEY is not configured."
    });

  try{
    const width = ratio==="9:16 Vertical" ? 768 : 1024;
    const height = ratio==="9:16 Vertical" ? 1365 : 1024;

    const url =
      "https://gen.pollinations.ai/image/" +
      encodeURIComponent(prompt) +
      "?model=flux" +
      "&width=" + width +
      "&height=" + height +
      "&nologo=true";

    const r = await fetch(url,{
      headers:{
        "Authorization":"Bearer " + POLL_KEY
      }
    });

    if(!r.ok){
      const errorText = await r.text();
      return res.status(r.status).json({
        error:errorText || "Pollinations image generation failed."
      });
    }

    const imageBuffer = Buffer.from(
      await r.arrayBuffer()
    );

    res.setHeader(
      "Content-Type",
      r.headers.get("content-type") || "image/jpeg"
    );

    res.send(imageBuffer);

  }catch(e){
    res.status(500).json({
      error:e.message
    });
  }
});
app.post("/api/video/start", async (req,res)=>{
  if(!requireKey(res)) return;

  const {
    prompt,
    ratio="9:16 Vertical",
    quality="720p"
  }=req.body;

  if(!prompt)
    return res.status(400).json({error:"Prompt is required."});

  try{
    const r=await fetch("https://generativelanguage.googleapis.com/v1beta/models/veo-3.1-lite-generate-preview:predictLongRunning",{
      method:"POST",
      headers:{
        "x-goog-api-key":API_KEY,
        "Content-Type":"application/json"
      },
      body:JSON.stringify({
        instances:[{prompt}],
        parameters:{
          aspectRatio:ratioValue(ratio),
          resolution:quality
        }
      })
    });

    const data=await r.json();

    if(!r.ok)
      return res.status(r.status).json({
        error:data.error?.message||"Video generation error"
      });

    res.json({operation:data.name});

  }catch(e){
    res.status(500).json({error:e.message});
  }
});

app.get("/api/video/status", async (req,res)=>{
  if(!requireKey(res)) return;

  const name=req.query.name;

  if(!name)
    return res.status(400).json({error:"Operation name is required."});

  try{
    const r=await fetch(
      "https://generativelanguage.googleapis.com/v1beta/"+name,
      {
        headers:{"x-goog-api-key":API_KEY}
      }
    );

    const data=await r.json();

    if(!r.ok)
      return res.status(r.status).json({
        error:data.error?.message||"Status error"
      });

    if(!data.done)
      return res.json({done:false});

    if(data.error)
      return res.status(500).json({
        error:data.error.message||"Video generation failed"
      });

    const video=data.response?.generateVideoResponse
      ?.generatedSamples?.[0]?.video;

    if(!video?.uri)
      return res.status(500).json({
        error:"Video finished but no video URI was returned."
      });

    res.json({
      done:true,
      uri:video.uri
    });

  }catch(e){
    res.status(500).json({error:e.message});
  }
});

app.get("/api/video/file", async (req,res)=>{
  if(!requireKey(res)) return;

  const uri=req.query.uri;

  if(!uri || !uri.startsWith("https://"))
    return res.status(400).send("Invalid video URI.");

  try{
    const r=await fetch(uri,{
      headers:{"x-goog-api-key":API_KEY}
    });

    if(!r.ok)
      return res.status(r.status).send("Could not download video.");

    res.setHeader("Content-Type","video/mp4");
    res.setHeader(
      "Content-Disposition",
      'inline; filename="prompt-studio-video.mp4"'
    );

    const buf=Buffer.from(await r.arrayBuffer());

    res.send(buf);

  }catch(e){
    res.status(500).send(e.message);
  }
});

app.get("/",(req,res)=>
  res.sendFile(path.join(__dirname,"index.html"))
);

app.listen(PORT,()=>
  console.log(`Prompt Studio running on http://localhost:${PORT}`)
);
