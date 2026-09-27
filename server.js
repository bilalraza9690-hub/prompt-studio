app.post("/api/image", async (req,res)=>{
  if(!requireKey(res)) return;

  const {
    prompt,
    ratio="9:16 Vertical",
    size="1K"
  } = req.body;

  if(!prompt){
    return res.status(400).json({error:"Prompt is required."});
  }

  try{
    const aspectRatio = ratioValue(ratio);

    const r = await fetch(
    "https://generativelanguage.googleapis.com/v1/models/gemini-3.1-flash-image:generateContent",
      {
        method:"POST",
        headers:{
          "x-goog-api-key":API_KEY,
          "Content-Type":"application/json"
        },
        body:JSON.stringify({
          contents:[
            {
              parts:[
                {
                  text:prompt
                }
              ]
            }
          ],
          generationConfig:{
            responseModalities:["TEXT","IMAGE"],
            responseFormat:{
              image:{
                aspectRatio:aspectRatio,
                imageSize:size
              }
            }
          }
        })
      }
    );

    const data = await r.json();

    if(!r.ok){
      return res.status(r.status).json({
        error:data.error?.message || "Image generation error"
      });
    }

    const parts =
      data.candidates?.[0]?.content?.parts || [];

    const imagePart =
      parts.find(p => p.inlineData?.data);

    if(!imagePart){
      return res.status(500).json({
        error:"No image was returned."
      });
    }

    res.json({
      mimeType:imagePart.inlineData.mimeType || "image/png",
      data:imagePart.inlineData.data
    });

  }catch(e){
    res.status(500).json({
      error:e.message
    });
  }
});
