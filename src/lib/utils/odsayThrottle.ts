/**
 * 배열을 chunkSize 단위로 나누어 순차적으로 async 매핑을 진행하되,
 * 각 청크 내에서는 병렬 처리(Promise.all)하고 청크 간에 delayMs 지연시간을 둡니다.
 */
export async function chunkAsync<T, R>(
  items: T[],
  fn: (item: T, index: number) => Promise<R>,
  chunkSize: number = 2,
  delayMs: number = 150
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);
    const chunkResults = await Promise.all(
      chunk.map((item, chunkIdx) => fn(item, i + chunkIdx))
    );
    results.push(...chunkResults);

    if (i + chunkSize < items.length && delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  return results;
}
