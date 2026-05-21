import { useState } from "react";

import { Button } from "@/components/ui/button";

function App() {
  const [count, setCount] = useState(0);

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-4 bg-background p-6">
      <p className="text-sm text-muted-foreground">shadcn/ui 按钮测试</p>
      <Button onClick={() => setCount((value) => value + 1)}>
        点击次数：{count}
      </Button>
    </main>
  );
}

export default App;
