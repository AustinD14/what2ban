import { useState, useEffect, useRef } from "react";

import React from "react";

function MainPage() {
  const [formData, setFormData] = useState({
    steamId: "1213",
  });
  const [loading, setLoading] = useState(false);
  const { steamId } = formData;

  const onSubmit = async (e) => {
    e.preventDefault();

    // setLoading(true);

    const formDataCopy = {
      ...formData,
    };

    console.log(formDataCopy);
  };

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
        <form onSubmit={onSubmit}>
          <label className="formLabel">SteamId</label>
          <input
            className="formInputName"
            type="text"
            id="title"
            value={steamId}
            onChange={e => setFormData(e.target.value)}
            required
          />
          <button type="submit" className="primaryButton createListingButton">
            Submit
          </button>
        </form>
      </main>
    </div>
  );
}

export default MainPage;
