// src/openai.js
import OpenAI from "openai";
import { config } from "./config.js";
import createLogger from "./logger.js";

const logger = createLogger("OPENAI");
const client = new OpenAI({ apiKey: config.openai.apiKey });

/**
 * Get a conversational response from the LLM.
 * @param {string} userInput - The transcribed text from the client.
 * @returns {Promise<string>} - The LLM's reply.
 */
export async function getLLMResponse(userInput) {
  try {
    const response = await client.chat.completions.create({
      model: config.openai.model,
      messages: [
        {
          role: "system",
          content: `You are a professional voice agent representing our business.
          - Speak naturally, like a human.
          - Explain our services clearly and politely.
          - Answer basic questions about what we do.
          - Keep responses concise but conversational.
          - Handle back-and-forth naturally, without sounding scripted.`,
        },
        { role: "user", content: userInput },
      ],
    });

    const reply = response.choices[0].message.content;
    logger.info(`LLM response generated: "${reply}"`);
    return reply;
  } catch (err) {
    logger.error("Error generating LLM response: " + err.message);
    return "I'm sorry, I had trouble responding just now.";
  }
}
