import React from "react";

const CardStyle = {
  border: "1px solid #03506f",
  borderRadius: "30px",
  padding: "20px",
  margin: "20px",
  width: "270px",
  height: "170px",
  backgroundColor: "#75cfb8",
};

function Cards(props) {
  return (
    <div style={CardStyle}>
      <span>{props.id}</span>
    </div>
  );
}

export default Cards;
