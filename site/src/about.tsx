import { render } from "preact";
import { Header } from "./header.tsx";
import HeroImage from "../../assets/hero.png";
import "./style.css";

function About() {
  return (
    <>
      <Header about />
      <main class="about-page">
        <article class="about-content">
          <h1>About</h1>
          <p>Create a DevCard from your GitHub profile!</p>
          <img class="about-hero" src={HeroImage} alt="GitHub DevCard" width="1520" height="1050" />
          <p>
            GitHub DevCard is a service that creates a stylish card image from your GitHub profile!
          </p>
          <p>
            You can generate and download the image from this site, or paste the Markdown below into
            your README!
          </p>
          <pre class="about-code">
            <code>
              {
                "![GitHub DevCard](https://www.nuskey.md/github-devcard/api/devcard?username=YOUR_USERNAME&theme=sky&pattern=leaf)"
              }
            </code>
          </pre>
          <p>
            Replace <code>YOUR_USERNAME</code> with your GitHub username.
          </p>
          <section>
            <h2>About the author</h2>
            <p>
              GitHub DevCard is created by{" "}
              <a href="https://github.com/nuskey8" target="_blank" rel="noopener noreferrer">
                @nuskey8
              </a>
              . Consider supporting this project on{" "}
              <a
                href="https://github.com/sponsors/nuskey8"
                target="_blank"
                rel="noopener noreferrer"
              >
                Github Sponsors
              </a>{" "}
              or{" "}
              <a href="https://ko-fi.com/nuskey8" target="_blank" rel="noopener noreferrer">
                Ko-fi
              </a>
              !
            </p>
          </section>
          <a class="about-back" href={import.meta.env.BASE_URL}>
            Create your DevCard <span aria-hidden="true">→</span>
          </a>
        </article>
      </main>
    </>
  );
}

render(<About />, document.getElementById("app")!);
