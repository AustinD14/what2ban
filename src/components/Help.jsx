import Button from "react-bootstrap/Button";
import OverlayTrigger from "react-bootstrap/OverlayTrigger";
import Popover from "react-bootstrap/Popover";

const popover = (
  <Popover id="popover-basic" placement="left">
    <Popover.Header as="h3">What is What2Ban?</Popover.Header>
    <Popover.Body>
      <strong>What2ban</strong> shows you the most played heroes in the player's
      last 1000 matches.
      <br />
      <br />
      Simply enter the player's Dota2/Friend ID. You can also enter multiple
      ID's.
      <br />
      <br />
      Here, try Arteezy's ID.
      <br />
      <strong>86745912</strong>
    </Popover.Body>
  </Popover>
);

const Help = () => {
  return (
    <OverlayTrigger trigger="click" placement="left" overlay={popover}>
      <Button variant="primary">Help</Button>
    </OverlayTrigger>
  );
};

export default Help;
