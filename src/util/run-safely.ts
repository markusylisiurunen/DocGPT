export function runSafely(runnable: () => Promise<void>) {
  runnable().catch((error) => {
    console.log(error);
  });
}
