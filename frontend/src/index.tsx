/* @refresh reload */
import { render } from "solid-js/web";
import { Router, Route } from "@solidjs/router";
import "./index.css";
import App from "./App";
import DashboardPage from "./pages/DashboardPage";
import AdminPage from "./pages/AdminPage";
import TargetDetailPage from "./pages/TargetDetailPage";

const root = document.getElementById("root");
render(
  () => (
    <Router root={App}>
      <Route path="/" component={DashboardPage} />
      <Route path="/targets/:targetId" component={TargetDetailPage} />
      <Route path="/admin" component={AdminPage} />
    </Router>
  ),
  root!,
);
