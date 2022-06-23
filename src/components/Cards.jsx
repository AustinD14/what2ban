import React from "react";
import heroes from "../Data/heroes.json";

function Cards(props) {
  // console.log(props.props.mostPlayedHeroes);
  // console.log(heroes[props.props.mostPlayedHeroes[0].hero_id].localized_name);
  // console.log(props.props.mostPlayedHeroes[0].hero_id);

  const NUM_OF_HEROES_TO_DISPLAY = 10;
  const heroList = [];

  for (let index = 0; index < NUM_OF_HEROES_TO_DISPLAY; index++) {
    heroList.push(
      heroes[props.props.mostPlayedHeroes[index].hero_id].localized_name
    );
  }

  const listHeroes = heroList.map((heroList) => (
    <li key={heroList}>{heroList}</li>
  ));

  console.log(heroList);
  return (
    <div className="card_style">
      <img src={props.props.avatar} />
      <h3>{props.props.id}</h3>
      <h4>{props.props.name}</h4>
      <ul>{listHeroes}</ul>
    </div>
  );
}

export default Cards;
