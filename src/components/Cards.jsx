import React from "react";
import heroes from "../Data/heroes.json";
import Card from "react-bootstrap/Card";
import ListGroup from "react-bootstrap/ListGroup";

function Cards(props) {
  // console.log(props.props.mostPlayedHeroes);
  // console.log(heroes[props.props.mostPlayedHeroes[0].hero_id].localized_name);
  // console.log(props.props.mostPlayedHeroes[0].hero_id);

  const NUM_OF_HEROES_TO_DISPLAY = 10;
  const heroList = [];

  const calculateWinRate = (wins, total) => {
    return (wins / total) * 100;
  };

  console.log({
    name: heroes[props.props.mostPlayedHeroes[0].hero_id].localized_name,
    games: props.props.mostPlayedHeroes[0].games,
    winrate:
      Math.floor(
        calculateWinRate(
          props.props.mostPlayedHeroes[0].win,
          props.props.mostPlayedHeroes[0].games
        )
      ) + "%",
  });

  for (let index = 0; index < NUM_OF_HEROES_TO_DISPLAY; index++) {
    heroList.push(
      // heroes[props.props.mostPlayedHeroes[index].hero_id].localized_name
      {
        name: heroes[props.props.mostPlayedHeroes[index].hero_id]
          .localized_name,
        games: props.props.mostPlayedHeroes[index].games,
        winrate:
          Math.floor(
            calculateWinRate(
              props.props.mostPlayedHeroes[index].win,
              props.props.mostPlayedHeroes[index].games
            )
          ) + "%",
      }
    );
  }

  const listHeroes = heroList.map((heroList) => (
    <ListGroup.Item className="hero_list" key={heroList}>
      <div className="ms-2 me-auto">
        <div className="fw-bold">
          <strong>{heroList.name}</strong>
        </div>
        {heroList.games} Matches with {heroList.winrate} winrate
      </div>
    </ListGroup.Item>
  ));

  console.log(props.props.mostPlayedHeroes[0].hero_id);
  return (
    <Card
      bg="primary"
      border="secondary"
      style={{ width: "18rem" }}
      text="white"
    >
      <Card.Body>
        <div className="card-header">
          <Card.Img variant="top" src={props.props.avatar} />
          <div className="card-header-title">
            <Card.Title>{props.props.name}</Card.Title>
            <Card.Subtitle className="mb-2 text-muted">
              {props.props.id}
            </Card.Subtitle>
          </div>
        </div>
        <ListGroup>{listHeroes}</ListGroup>
      </Card.Body>
    </Card>
  );
}

export default Cards;
