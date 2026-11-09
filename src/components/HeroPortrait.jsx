export default function HeroPortrait({ hero, className = "" }) {
  if (!hero?.name) return <span className={`hero-portrait fallback ${className}`}>?</span>;
  const slug = hero.name.replace("npc_dota_hero_", "");
  return (
    <img
      className={`hero-portrait ${className}`}
      src={`https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/${slug}.png`}
      alt=""
      loading="lazy"
      onLoad={(event) => { event.currentTarget.style.opacity = "1"; }}
      onError={(event) => { event.currentTarget.style.opacity = "0.2"; }}
    />
  );
}
