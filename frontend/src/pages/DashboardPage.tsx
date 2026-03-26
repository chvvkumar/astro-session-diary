import { Component } from "solid-js";
import Sidebar from "../components/Sidebar";
import CommandBar from "../components/CommandBar";
import TargetFeed from "../components/TargetFeed";

const DashboardPage: Component = () => {
  return (
    <div class="flex">
      <Sidebar />
      <main class="flex-1 min-h-[calc(100vh-57px)]">
        <CommandBar />
        <TargetFeed />
      </main>
    </div>
  );
};

export default DashboardPage;
