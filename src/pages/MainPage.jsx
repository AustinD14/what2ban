import { useState, useEffect, useRef } from "react";
import React from "react";
import axios from "axios";
import Cards from "../components/Cards";

function MainPage() {
  const [formData, setFormData] = useState({
    accounId: "",
  });
  const { accounId } = formData;
  const [playerData, setPlayerData] = useState({
    id: "",
    name: "",
    avatar: "",
  });
  const [cardsOnContainer, setCardsOnContainer] = useState([]);

  //will get values from opendota using accounId
  const onSubmit = async (e) => {
    e.preventDefault();

    try {
      const response = await axios.get(
        "https://api.opendota.com/api/players/" + accounId
      );
      console.log(response);
      
    } catch (error) {
      console.log(error);
    }
  };

  //takes care of steamId input
  const onMutate = (e) => {
    let boolean = null;

    if (e.target.value === "true") {
      boolean = true;
    }
    if (e.target.value === "false") {
      boolean = false;
    }

    // Text/Booleans/Numbers
    if (!e.target.files) {
      setFormData((prevState) => ({
        ...prevState,
        [e.target.id]: boolean ?? e.target.value,
      }));
    }
  };

  return (
    <div className="profile">
      <main>
        <form className="accounId_form" onSubmit={onSubmit}>
          <label className="formLabel">Dota2 ID:</label>
          <input
            className="formInputName"
            type="number"
            iD="accounId"
            value={accounId}
            onChange={onMutate}
            required
          />
          <button type="submit" className="button3" event={()=>{
            setCardsOnContainer([...cardsOnContainer, <Cards props = {playerData}/>])
          }}>
            Submit
          </button>
        </form>
        <div className="cards_container">{cardsOnContainer}</div>
      </main>
    </div>
  );
}

export default MainPage;
