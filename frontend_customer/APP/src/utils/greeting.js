// Time-of-day greeting shown on the home screen.
// Boundaries: 00:00–11:59 morning, 12:00–16:59 afternoon, 17:00–23:59 evening.
// Late-night hours stay on "Good Evening" rather than "Good Night", since
// "Good Night" reads as a farewell rather than a greeting.
export function getGreeting(date = new Date()) {
  const hour = date.getHours();

  if (hour < 12) {
    return { text: 'Good Morning', emoji: '☀️' };
  }
  if (hour < 17) {
    return { text: 'Good Afternoon', emoji: '👋' };
  }
  return { text: 'Good Evening', emoji: '🌆' };
}
