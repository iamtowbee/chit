export interface LLM {
  generate(prompt: string): Promise<string>;
}

/**
 * Deterministic mock so the example runs without any API key.
 * Provide USER_LLM_API_KEY (plus optional USER_LLM_BASE_URL / USER_LLM_MODEL)
 * to switch to a real OpenAI-compatible chat endpoint.
 */
export function createLLM(): LLM {
  if (process.env.USER_LLM_API_KEY) {
    return new RemoteLLM(
      process.env.USER_LLM_BASE_URL ?? 'https://api.openai.com/v1',
      process.env.USER_LLM_MODEL ?? 'gpt-4o-mini',
      process.env.USER_LLM_API_KEY,
    );
  }
  return new MockLLM();
}

function hash(input: string): string {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

class MockLLM implements LLM {
  async generate(prompt: string): Promise<string> {
    const id = hash(prompt).slice(0, 8);
    return `[mock ${id}] ${prompt.split('\n')[0]?.slice(0, 80) ?? 'generated'}`;
  }
}

class RemoteLLM implements LLM {
  constructor(
    private readonly baseUrl: string,
    private readonly model: string,
    private readonly apiKey: string,
  ) {}

  async generate(prompt: string): Promise<string> {
    const res = await fetch(`${this.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!res.ok) {
      throw new Error(`LLM request failed with HTTP ${res.status}`);
    }
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error('LLM returned no content');
    return content;
  }
}
