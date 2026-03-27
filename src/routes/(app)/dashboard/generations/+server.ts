import {
  type UIMessage,
  convertToModelMessages,
  streamText,
} from 'ai';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { OPEN_ROUTER_API_KEY } from '$env/static/private';

const gateway = createOpenRouter({
  apiKey: OPEN_ROUTER_API_KEY,
});

export async function POST({ request }) {
  const { messages }: { messages: UIMessage[] } = await request.json();
    console.log(messages)
  const result = streamText({
    model: gateway.chat('minimax/minimax-m2.5'), messages: await convertToModelMessages(messages)
  }); 

  return result.toUIMessageStreamResponse();
}