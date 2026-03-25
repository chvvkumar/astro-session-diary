import { type Component, type ParentProps } from "solid-js";
import NavBar from "./components/NavBar";

const App: Component<ParentProps> = (props) => {
  return (
    <div class="min-h-screen bg-astro-dark">
      <NavBar />
      {props.children}
    </div>
  );
};

export default App;
