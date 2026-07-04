import { RouterProvider } from "react-router-dom";

import { ErrorBoundary } from "@/components/error-boundary";
import { router } from "@/app/router";

function App() {
  return (
    <ErrorBoundary title="App failed to render">
      <RouterProvider router={router} />
    </ErrorBoundary>
  );
}

export default App;
