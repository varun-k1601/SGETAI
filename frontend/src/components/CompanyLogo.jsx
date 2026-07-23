export function getMediaUrl(media) {
  if (!media) {
    return "";
  }

  if (typeof media === "string") {
    return media;
  }

  return media.url || "";
}

export function CompanyLogo({ organization, size = "md" }) {
  const logoUrl = getMediaUrl(organization?.logo);
  const companyName = organization?.companyName || organization?.organizationName || "Company";
  const initial = companyName.trim().charAt(0).toUpperCase() || "C";

  return (
    <span className={`company-logo company-logo--${size}`} aria-hidden="true">
      {logoUrl ? <img src={logoUrl} alt="" /> : <span>{initial}</span>}
    </span>
  );
}
