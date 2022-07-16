import React from "react";
import { LinkContainer } from "react-router-bootstrap";
import { Navbar, Container, Nav, NavDropdown } from "react-bootstrap";

import Help from "./Help";

const Header = () => {
  return (
    <header>
      <Navbar bg="primary" variant="dark" expand="lg" collapseOnSelect>
        <Container>
          <LinkContainer to="/">
            <Navbar.Brand>What2Ban</Navbar.Brand>
          </LinkContainer>
          <Nav className="ms-auto">
            <Help />
          </Nav>
        </Container>
      </Navbar>
    </header>
  );
};

export default Header;
