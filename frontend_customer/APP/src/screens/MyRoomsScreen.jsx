import React, { useEffect, useState } from 'react';
import { Monitor, Tv, Video, Volume2, Sliders, ChevronRight, AlertCircle, Wrench, ShieldCheck, MapPin } from 'lucide-react';
export function MyRoomsScreen({ onReportIssueForRoom, activeTickets = [], locations = [], rooms = [] }) {
  const [selectedLocationId, setSelectedLocationId] = useState(locations[0]?.id || null);
  const [activeRoomDetail, setActiveRoomDetail] = useState(null);

  useEffect(() => {
    if (!locations.some((location) => location.id === selectedLocationId)) {
      setSelectedLocationId(locations[0]?.id || null);
    }
  }, [locations, selectedLocationId]);

  const filteredRooms = rooms.filter((room) =>
    (room.location_id || room.locationId) === selectedLocationId
  );
  const activeLocation = locations.find((l) => l.id === selectedLocationId);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '20px', gap: '16px' }}>
      

      {/* Location Selector Tabs */}
      <div className="sleek-scrollbar" style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px' }}>
        {locations.map((loc) => (
          <button
            key={loc.id}
            onClick={() => setSelectedLocationId(loc.id)}
            style={{
              padding: '8px 14px',
              borderRadius: '20px',
              border: selectedLocationId === loc.id ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
              background: selectedLocationId === loc.id ? 'var(--color-primary)' : 'var(--color-surface)',
              color: selectedLocationId === loc.id ? '#FFFFFF' : 'var(--color-text-primary)',
              fontSize: '12px',
              fontWeight: '700',
              cursor: 'pointer',
              whiteSpace: 'nowrap'
            }}
          >
            {loc.name}
          </button>
        ))}
      </div>

      {/* Location Details Info */}
      {activeLocation && <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--color-text-secondary)', background: 'var(--color-surface)', padding: '10px 14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
        <MapPin size={15} color="var(--color-primary)" />
        <span>{activeLocation.address || activeLocation.city || activeLocation.name}</span>
      </div>}

      {/* Rooms Cards List */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {filteredRooms.length > 0 ? filteredRooms.map((room) => (
          <div
            key={room.id}
            className="card card-clickable"
            onClick={() => setActiveRoomDetail(room)}
            style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Monitor size={20} color="var(--color-primary)" />
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: '800', color: 'var(--color-text-primary)' }}>
                    {room.name}
                  </h3>
                  <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>
                    {room.room_type || room.type || 'Room'}{room.capacity ? ` • Capacity ${room.capacity} Pax` : ''}
                  </div>
                </div>
              </div>

              <ChevronRight size={18} color="var(--color-text-tertiary)" />
            </div>

            {/* Hardware Tags Badges */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {(Array.isArray(room.tags) ? room.tags : []).map((t, idx) => (
                <span
                  key={idx}
                  style={{
                    fontSize: '11px',
                    fontWeight: '600',
                    background: 'var(--color-primary-light)',
                    color: 'var(--color-primary)',
                    padding: '3px 8px',
                    borderRadius: '4px'
                  }}
                >
                  {t}
                </span>
              ))}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pt: '6px', borderTop: '1px solid var(--color-border)', fontSize: '11px', color: 'var(--color-text-tertiary)' }}>
              <span>Installed Systems: {room.systemsCount ?? room.installedSystems?.length ?? 0}</span>
              <span style={{ color: 'var(--color-primary)', fontWeight: '700' }}>View Inventory &rarr;</span>
            </div>
          </div>
        )) : (
          <div className="card" style={{ padding: '28px 20px', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
            <AlertCircle size={32} style={{ margin: '0 auto 10px' }} />
            <strong>{locations.length === 0 ? 'No locations available' : 'No rooms found'}</strong>
            <p style={{ fontSize: '12px', marginTop: '6px' }}>
              {locations.length === 0 ? 'Add a location in the database first.' : 'Add rooms linked to this location in the database.'}
            </p>
          </div>
        )}
      </div>

      {/* Room Detail Modal Sheet */}
      {activeRoomDetail && (
        <div className="modal-overlay" onClick={() => setActiveRoomDetail(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <div>
                <h2 style={{ fontSize: '20px', fontWeight: '800', color: 'var(--color-text-primary)' }}>
                  {activeRoomDetail.name}
                </h2>
              </div>

              <button
                onClick={() => setActiveRoomDetail(null)}
                style={{ background: 'none', border: 'none', fontSize: '14px', fontWeight: '700', cursor: 'pointer', color: 'var(--color-text-tertiary)' }}
              >
                ✕
              </button>
            </div>

            {/* Room Location & Code */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', fontSize: '12px', color: 'var(--color-text-secondary)', marginBottom: '18px' }}>
              <span>{activeLocation?.name}</span>
              <span style={{color: '#CBD5E1'}}>|</span>
              <span>{activeRoomDetail.room_type || activeRoomDetail.type || 'Room'}</span>
              <span style={{color: '#CBD5E1'}}>|</span>
              <span>QR: {activeRoomDetail.qr_code || activeRoomDetail.qrCode || 'Not assigned'}</span>
            </div>

            {/* Installed Systems Breakdown */}
            <h4 style={{ fontSize: '14px', fontWeight: '800', color: 'var(--color-text-primary)', marginBottom: '12px' }}>
              Installed Hardware Systems ({activeRoomDetail.installedSystems?.length || 0}):
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '24px' }}>
              {(Array.isArray(activeRoomDetail.installedSystems) ? activeRoomDetail.installedSystems : []).map((sys, i) => {
                const hasLiveTicket = activeTickets.some(t => 
                  t.room === activeRoomDetail.name && 
                  t.category === sys.category && 
                  t.status !== 'Closed' && 
                  t.status !== 'Resolved'
                );
                const displayStatus = hasLiveTicket ? 'Issue Reported' : 'Healthy';

                return (
                  <div key={i} style={{ padding: '12px', borderRadius: 'var(--radius-md)', background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span style={{ fontSize: '11px', fontWeight: '700', color: 'var(--color-primary)' }}>
                        {sys.category}
                      </span>
                      {displayStatus === 'Issue Reported' && (
                        <span style={{ fontSize: '10px', background: '#FEF3F2', color: '#B42318', padding: '2px 8px', borderRadius: '10px', fontWeight: '800' }}>
                          ● Issue Reported
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '14px', fontWeight: '700', color: 'var(--color-text-primary)' }}>
                      {sys.name}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>
                      Model: {sys.model}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Primary Action Button: Report an Issue */}
            <button
              className="btn-primary"
              onClick={() => {
                const roomToReport = activeRoomDetail;
                setActiveRoomDetail(null);
                onReportIssueForRoom(roomToReport.id);
              }}
            >
              <Wrench size={18} />
              <span>Report an Issue for this Room</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
