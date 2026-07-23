export function SkillBadge({ skill, variant = "default" }) {
  return <span className={`skill-badge skill-badge--${variant}`}>{skill}</span>;
}
