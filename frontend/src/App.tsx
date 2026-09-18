import { Route, BrowserRouter, Routes } from "react-router-dom";
import { AuthProvider } from "@/context/AuthContext";
import Account from "@/pages/Account";
import CustomerBooking from "@/pages/CustomerBooking";
import OrderTracking from "@/pages/OrderTracking";
import PizzaioloDashboard from "@/pages/PizzaioloDashboard";
import SignIn from "@/pages/SignIn";
import SignUp from "@/pages/SignUp";

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<CustomerBooking />} />
          <Route path="/suivi/:orderId" element={<OrderTracking />} />
          <Route path="/pizzaiolo" element={<PizzaioloDashboard />} />
          <Route path="/inscription" element={<SignUp />} />
          <Route path="/connexion" element={<SignIn />} />
          <Route path="/compte" element={<Account />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
