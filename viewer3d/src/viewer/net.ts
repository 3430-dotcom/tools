/**
 * fetch() with a hard timeout via AbortController. Plain fetch() has no
 * timeout of its own -- on a restrictive/flaky network (e.g. a school
 * proxy that accepts the connection but never sends a response, or a
 * request that just silently stalls) the promise never settles, which
 * left the UI stuck on a "불러오는 중..." message forever with no error
 * and no way out except reloading the page. Aborting after `timeoutMs`
 * turns that into a real, actionable error instead.
 */
export async function fetchWithTimeout(url: string, timeoutMs = 15000): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { signal: controller.signal })
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      throw new Error('서버 응답이 없어요 (네트워크가 느리거나 막혀있을 수 있어요). 잠시 후 다시 시도해주세요.')
    }
    throw e
  } finally {
    clearTimeout(timer)
  }
}
