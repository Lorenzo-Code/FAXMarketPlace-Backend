function scoreAmenities(amenities) {
  let score = 0;

  if (!amenities || typeof amenities !== "object") return score;

  for (const [type, list] of Object.entries(amenities)) {
    if (!Array.isArray(list)) continue;

    switch (type) {
      case "restaurant":
        score += Math.min(list.length, 10) * 2; break;
      case "grocery_or_supermarket":
        score += Math.min(list.length, 5) * 3; break;
      case "gym":
        score += Math.min(list.length, 3) * 4; break;
      case "park":
        score += Math.min(list.length, 5) * 2; break;
      default:
        score += list.length;
    }
  }

  return Math.min(score, 100); // cap at 100
}

module.exports = { scoreAmenities };
