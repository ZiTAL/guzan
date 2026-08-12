const INSTAGRAM_PROFILE_URL = "https://www.instagram.com/guzanbermeo/";

function stripHtml(input) {
  const doc = new DOMParser().parseFromString(input || "", "text/html");
  return (doc.body.textContent || "").trim();
}

function truncate(text, max = 150) {
  if (!text) return "Deskribapena Instagramen irakurri.";
  return text.length <= max ? text : text.slice(0, max - 1).trim() + "...";
}

function fallbackPosts() {
  return [
    {
      title: "11 urte! GUZANDA EZAN DA!! Talan 12dxetan batun gaitzezen, Bermion 3.",
      link: "https://www.instagram.com/reel/Dbtex--IU2p/",
      thumbnail: "./assets/images/instagram-1.jpg"
    },
    {
      title: "EtxebiItzie Guzanen ardatz bat ezan da 2015etik! Berton lan eta bizi!",
      link: "https://www.instagram.com/reel/Dbdj1XAI8-g/",
      thumbnail: "./assets/images/instagram-2.jpg"
    },
    {
      title: "Astie ondo hasteko erdu geugaz tokiko garapen ekonomikuen inguruen berbetan.",
      link: "https://www.instagram.com/p/DbRAR7foMeD/",
      thumbnail: "./assets/images/instagram-3.jpg"
    }
  ];
}

function toPost(post, i) {
  const title = truncate(stripHtml(post.title) || ("Instagram posta " + (i + 1)), 100);
  return {
    title,
    link: post.link || INSTAGRAM_PROFILE_URL,
    thumbnail: post.thumbnail || "./assets/images/instagram-" + (i + 1) + ".jpg"
  };
}

function renderPosts(posts) {
  const target = document.getElementById("instagram-posts");
  if (!target) return;

  target.innerHTML = posts.map((post, i) =>
    '<article class="card">' +
      '<img src="' + post.thumbnail + '" alt="Instagram posta ' + (i + 1) + '">' +
      "<h3>" + post.title + "</h3>" +
      '<a href="' + post.link + '" target="_blank" rel="noopener">Posta ikusi</a>' +
    "</article>"
  ).join("");
}

function renderError() {
  // Intentionally silent fallback: render cards only.
}

async function loadInstagramPosts() {
  try {
    const response = await fetch("/api/instagram", { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error("Bad response");
    const payload = await response.json();
    const posts = Array.isArray(payload.posts) ? payload.posts.slice(0, 3) : [];
    if (!posts.length) throw new Error("No items");
    renderPosts(posts.map(toPost));
  } catch (_) {
    renderPosts(fallbackPosts());
    renderError();
  }
}

window.addEventListener("DOMContentLoaded", loadInstagramPosts);
