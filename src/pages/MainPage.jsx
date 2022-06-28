import { useState, useEffect, useRef } from "react";
import React from "react";
import axios from "axios";
import Cards from "../components/Cards";

function MainPage() {
  const isInitialMount = useRef(true);
  const [formData, setFormData] = useState({
    accountID: "",
  });
  const { accountID } = formData;
  const [playerData, setPlayerData] = useState({
    id: "",
    name: "",
    avatar: "",
    mostPlayedHeroes: "",
  });
  const [cardsOnContainer, setCardsOnContainer] = useState([]);
  useEffect(() => {
    //will spawn the cards when player data is updated
    if (isInitialMount.current) {
      isInitialMount.current = false;
    } else {
      spawnCard(playerData, accountID);
    }
  }, [playerData]);

  //function used in useEffect
  const spawnCard = (data, key) => {
    setCardsOnContainer([
      ...cardsOnContainer,
      <Cards props={data} key={key} />,
    ]);
  };

  //will get values from opendota using accountID
  const onSubmit = async (e) => {
    e.preventDefault();

    try {
      const playerRes = await axios.get(
        "https://api.opendota.com/api/players/" + accountID
      );
      const heroesRes = await axios.get(
        "https://api.opendota.com/api/players/" +
          accountID +
          "/heroes?limit=1000"
      );
      setPlayerData({
        id: playerRes.data.profile.account_id,
        name: playerRes.data.profile.personaname,
        avatar: playerRes.data.profile.avatar,
        mostPlayedHeroes: heroesRes.data,
      });
    } catch (error) {
      console.log(error);
    }
  };

  //takes care of accountID input
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
            id="accountID"
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
