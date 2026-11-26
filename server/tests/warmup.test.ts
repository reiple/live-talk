import { describe, expect, it } from 'vitest';
import { Warmer } from '../src/warmup.ts';

function fake(steps: { reachable: boolean; modelReady: boolean }[], loadFails = 0) {
  let i = 0;
  let fails = loadFails;
  const calls = { check: 0, load: 0, logs: [] as string[] };
  let t = 0;
  const w = new Warmer(
    {
      check: async () => {
        calls.check++;
        return steps[Math.min(i++, steps.length - 1)];
      },
      load: async () => {
        calls.load++;
        if (fails-- > 0) throw new Error('timeout');
      },
      sleep: async (ms) => {
        t += ms;
      },
      log: (m) => calls.logs.push(m),
      now: () => t,
    },
    1000,
  );
  return { w, calls };
}

describe('Warmer', () => {
  it('LLM 서버와 모델이 준비될 때까지 기다린 뒤 한 번 불러온다', async () => {
    const { w, calls } = fake([
      { reachable: false, modelReady: false },
      { reachable: true, modelReady: false },
      { reachable: true, modelReady: true },
    ]);
    expect(w.ready).toBe(false);
    expect(w.message).toBe('LLM 서버를 기다리는 중');
    await w.run();
    expect(w.ready).toBe(true);
    expect(w.message).toBe('준비됨');
    expect(calls.check).toBe(3);
    expect(calls.load).toBe(1);
    expect(calls.logs.at(-1)).toMatch(/준비 완료/);
  });

  it('불러오기가 실패하면 다시 시도한다', async () => {
    const { w, calls } = fake([{ reachable: true, modelReady: true }], 2);
    await w.run();
    expect(w.ready).toBe(true);
    expect(calls.load).toBe(3);
  });

  it('stop() 하면 기다리기를 멈춘다', async () => {
    const { w } = fake([{ reachable: false, modelReady: false }]);
    const p = w.run();
    w.stop();
    await p;
    expect(w.ready).toBe(false);
  });
});
