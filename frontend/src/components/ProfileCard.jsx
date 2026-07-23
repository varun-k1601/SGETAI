export function ProfileCard({ userName = "Alex Rivera", userTitle = "Senior Frontend Engineer", profileStats = {}, profileCompletion = {} }) {
  const {
    profileViews = 284,
    postImpressions = 3200,
    searchAppearances = 47
  } = profileStats;

  const {
    percentage = 72,
    completionItems = []
  } = profileCompletion;

  const defaultItems = [
    { label: "Add 2 more projects", completed: false },
    { label: "Upload intro video", completed: false },
    { label: "Add 3 more skills", completed: false }
  ];

  const items = completionItems.length > 0 ? completionItems : defaultItems;

  return (
    <div className="profile-card">
      {/* Blue Banner Header */}
      <div className="profile-card__banner"></div>

      {/* Avatar */}
      <div className="profile-card__avatar">
        <span>{userName.split(' ').map(n => n[0]).join('')}</span>
      </div>

      {/* Name & Title */}
      <div className="profile-card__header">
        <h3 className="profile-card__name">{userName}</h3>
        <p className="profile-card__title">{userTitle}</p>
      </div>

      {/* Stats Section */}
      <div className="profile-card__stats">
        <div className="stat-row">
          <span className="stat-label">Profile views</span>
          <div className="stat-value-group">
            <strong className="stat-value">{profileViews}</strong>
            <span className="stat-trend positive">+12%</span>
          </div>
        </div>
        <div className="stat-row">
          <span className="stat-label">Post impressions</span>
          <div className="stat-value-group">
            <strong className="stat-value">{(postImpressions / 1000).toFixed(1)}k</strong>
            <span className="stat-trend positive">+38%</span>
          </div>
        </div>
        <div className="stat-row">
          <span className="stat-label">Search appearances</span>
          <div className="stat-value-group">
            <strong className="stat-value">{searchAppearances}</strong>
          </div>
        </div>
      </div>

      {/* Profile Strength Section */}
      <div className="profile-card__strength">
        <div className="strength-header">
          <span className="strength-percentage">{percentage}% COMPLETE</span>
          <h4 className="strength-title">Profile strength</h4>
        </div>

        {/* Progress Bar */}
        <div className="strength-progress-bar">
          <div className="progress-fill" style={{ width: `${percentage}%` }}></div>
        </div>

        {/* Checklist */}
        <div className="strength-checklist">
          {items.map((item, idx) => (
            <label key={idx} className="checklist-item">
              <input
                type="checkbox"
                checked={item.completed || false}
                readOnly
              />
              <span>{item.label}</span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
