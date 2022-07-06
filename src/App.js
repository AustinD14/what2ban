import Header from "./components/Header";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";

import { Container } from "react-bootstrap";

import MainPage from "./pages/MainPage";

function App() {
  return (
    <>
      <Router>
        <Header />
        <main className="py-3">
          <Container>
            <Routes>
              <Route path="/" element={<MainPage />} />
            </Routes>
          </Container>
        </main>
      </Router>
    </>
  );
}

export default App;
