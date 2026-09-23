import { Route, BrowserRouter, Routes } from "react-router-dom";
import { AuthProvider } from "@/context/AuthContext";
import Account from "@/pages/Account";
import CustomerBooking from "@/pages/CustomerBooking";
import OrderTracking from "@/pages/OrderTracking";
import SignIn from "@/pages/SignIn";
import SignUp from "@/pages/SignUp";
import Clients from "@/pages/staff/Clients";
import MenuAdmin from "@/pages/staff/MenuAdmin";
import Orders from "@/pages/staff/Orders";
import Service from "@/pages/staff/Service";
import Slots from "@/pages/staff/Slots";
import StaffLayout from "@/pages/staff/StaffLayout";
import StaffLogin from "@/pages/staff/StaffLogin";

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<CustomerBooking />} />
          <Route path="/suivi/:orderId" element={<OrderTracking />} />
          <Route path="/inscription" element={<SignUp />} />
          <Route path="/connexion" element={<SignIn />} />
          <Route path="/compte" element={<Account />} />

          {/* Staff back-office, behind the staff password (StaffLayout checks the session). */}
          <Route path="/pizzaiolo/connexion" element={<StaffLogin />} />
          <Route path="/pizzaiolo" element={<StaffLayout />}>
            <Route index element={<Service />} />
            <Route path="commandes" element={<Orders />} />
            <Route path="carte" element={<MenuAdmin />} />
            <Route path="creneaux" element={<Slots />} />
            <Route path="clients" element={<Clients />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
