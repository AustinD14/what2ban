import { useState, useEffect, useRef } from "react";
import React from "react";
import axios from "axios";
import Cards from "../components/Cards";

function MainPage() {
  const [formData, setFormData] = useState({
    accounId: "",
  });
  const { accountID } = formData;
  const [playerData, setPlayerData] = useState({
    id: "",
    name: "",
    avatar: "",
  });
  const [cardsOnContainer, setCardsOnContainer] = useState([]);
  const spawnCard = (data, key) => {
    setCardsOnContainer([
      ...cardsOnContainer,
      <Cards props={data} key={key} />,
    ]);
  };
  const isInitialMount = useRef(true);
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
    } else {
      spawnCard(playerData, accountID);
    }
  }, [playerData]);

  //will get values from opendota using accountID
  const onSubmit = async (e) => {
    e.preventDefault();

    try {
      const response = await axios.get(
        "https://api.opendota.com/api/players" + accountID
      );
      console.log(response);
      setPlayerData({
        id: response.data.profile.account_id,
        name: response.data.profile.personaname,
        avatar: response.data.profile.avatar,
      });
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
            id="accounId"
            value={accountID}
            onChange={onMutate}
            required
          />
          <button type="submit" className="button3">
            Submit
          </button>
        </form>
        <div className="cards_container">{cardsOnContainer}</div>
      </main>
    </div>
  );
}

export default MainPage;
