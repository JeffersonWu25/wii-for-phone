export default function ItemSlots({
  primary,
  secondary,
  color,
  secondaryColor,
  primaryFace,
  secondaryFace,
  effect,
}) {
  const fx = effect ? ` kart-fx-${effect}` : '';
  return (
    <div className={`kart-items${fx}`}>
      <Slot id={secondary} face={secondaryFace} color={secondaryColor} className="kart-item-secondary" />
      <Slot id={primary} face={primaryFace} color={color} className="kart-item-primary" />
    </div>
  );
}

function Slot({ id, face, color, className }) {
  const rolling = face === 'roll';
  const held = face === 'held';
  return (
    <div className={`kart-item ${className}${held || rolling ? ' is-filled' : ''}${rolling ? ' is-rolling' : ''}`}>
      {held ? (
        <span
          className={`kart-item-icon item-${id}`}
          style={color ? { '--item': color } : undefined}
        />
      ) : null}
      {rolling ? <span className="kart-item-roll" aria-hidden="true" /> : null}
    </div>
  );
}
