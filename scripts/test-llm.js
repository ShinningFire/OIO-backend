import 'dotenv/config';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env['LLM_API_KEY'],
  baseURL: process.env['LLM_API_URL'],
});

async function main() {
  const model = process.env['LLM_MODEL'];

  // Non-streaming:
  console.log('----- standard request -----');
  const completion = await openai.chat.completions.create({
    messages: [
      { role: 'system', content: '你是人工智能助手' },
      { role: 'user', content: '你好' },
    ],
    model,
  });
  console.log(completion.choices[0]?.message?.content);

  // Streaming:
  console.log('----- streaming request -----');
  const stream = await openai.chat.completions.create({
    messages: [
      { role: 'system', content: '你是人工智能助手' },
      { role: 'user', content: '你好' },
      { role: 'user', content: '如果你收到了我上面的消息，请你再回复我一句：你好你好 你的测试脚本跑成功了' },

    ],
    model,
    stream: true,
  });
  for await (const part of stream) {
    process.stdout.write(part.choices[0]?.delta?.content || '');
  }
  process.stdout.write('\n');
}

main();
