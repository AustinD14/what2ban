// import { useNavigate, useLocation } from "react-router-dom";

function Navbar() {
//   const navigate = useNavigate();
//   const location = useLocation();

//   const pathMatchRoute = (route) => {
//     if (route === location.pathname) {
//       return true;
//     }
//   };

  return (
    <header className="navbar">
      <div className="navbar__title navbar__item">What2Ban</div>
      <div className="navbar__item">About Us</div>
      <div className="navbar__item">Contact</div>
      <div className="navbar__item">Help</div>
    </header>
  );
}

export default Navbar;



