import { Route, BrowserRouter, Routes } from "react-router-dom";
import CustomerBooking from "@/pages/CustomerBooking";
import PizzaioloDashboard from "@/pages/PizzaioloDashboard";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<CustomerBooking />} />
        <Route path="/pizzaiolo" element={<PizzaioloDashboard />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
