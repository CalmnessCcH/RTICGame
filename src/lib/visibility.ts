export function stopWhenBackgrounded(target: Document, stop: () => void) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const changed = () => {
    clearTimeout(timer);
    if (target.hidden)
      timer = setTimeout(() => {
        if (target.hidden) stop();
      }, 1000);
  };
  target.addEventListener("visibilitychange", changed);
  return () => {
    clearTimeout(timer);
    target.removeEventListener("visibilitychange", changed);
  };
}
