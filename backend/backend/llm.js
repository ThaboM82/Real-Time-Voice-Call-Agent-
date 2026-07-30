const { Configuration, OpenAIApi } = require("openai");

const openai = new OpenAIApi(
  new Configuration({ apiKey: process.env.OPENAI_API_KEY })
);

async function getLLMResponse(transcript) {
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: transcript }],
    });
    return completion.choices[0].message.content;
  } catch (err) {
    console.error("? LLM error:", err.message);
    return null;
  }
}

module.exports = { getLLMResponse };
