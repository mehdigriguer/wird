import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";

class ErrorBoundary extends React.Component {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    if (this.state.error)
      return (
        <main>
          <h1>Le programme n’a pas pu s’afficher.</h1>
          <p>
            Recharge la page. Les données enregistrées dans ton navigateur ne
            sont pas effacées.
          </p>
          <button onClick={() => location.reload()}>Recharger</button>
        </main>
      );
    return this.props.children;
  }
}

createRoot(document.getElementById("root")).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
