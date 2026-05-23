import { useEffect, useState } from 'react';
import { Link, Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { apiRequest } from './api/client';
import { useAuth } from './auth/AuthContext';

function Layout({ children }) {
  const { user, logout } = useAuth();
  return (
    <div className="app-shell">
      <nav className="navbar">
        <Link className="brand" to="/">
          <span className="brand-mark">AYBU</span>
          <span>Cinema</span>
        </Link>
        <div className="nav-links">
          <Link to="/events">Events</Link>
          {user && <Link to="/my-reservations">My Tickets</Link>}
          {user?.role === 'admin' && <Link to="/admin">Admin</Link>}
          {!user ? <Link className="button ghost" to="/login">Login</Link> : <button className="button ghost" onClick={logout}>Logout</button>}
        </div>
      </nav>
      {children}
    </div>
  );
}

function Protected({ children, adminOnly = false }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (adminOnly && user.role !== 'admin') return <Navigate to="/events" replace />;
  return children;
}

function Home() {
  return (
    <main className="hero">
      <div className="hero-copy">
        <p className="eyebrow">Cloud-native university events</p>
        <h1>Reserve your cinema seat before the countdown ends.</h1>
        <p>
          AYBU Cinema uses distributed Redis locks and PostgreSQL constraints to keep concurrent bookings safe, fast and fair.
        </p>
        <div className="hero-actions">
          <Link className="button primary" to="/events">Browse Events</Link>
          <Link className="button secondary" to="/register">Create AYBU Account</Link>
        </div>
      </div>
      <div className="hero-poster">
        <div className="poster-glow" />
        <div className="poster-card">
          <span>Now Booking</span>
          <strong>Spring Cinema Night</strong>
          <small>Redis TTL lock: 05:00</small>
        </div>
      </div>
    </main>
  );
}

function AuthPage({ mode }) {
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ fullName: '', email: '', password: '' });
  const [error, setError] = useState('');
  const isRegister = mode === 'register';

  async function submit(event) {
    event.preventDefault();
    setError('');
    try {
      if (isRegister) await register(form.fullName, form.email, form.password);
      else await login(form.email, form.password);
      navigate('/events');
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <main className="auth-grid">
      <section className="auth-card">
        <p className="eyebrow">AYBU SSO style access</p>
        <h2>{isRegister ? 'Create your student account' : 'Welcome back'}</h2>
        <p className="muted">Registration is restricted to @aybu.edu.tr email addresses.</p>
        <form onSubmit={submit} className="form">
          {isRegister && <input placeholder="Full name" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />}
          <input type="email" placeholder="name@aybu.edu.tr" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <input type="password" placeholder="Password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          {error && <div className="alert">{error}</div>}
          <button className="button primary" type="submit">{isRegister ? 'Register' : 'Login'}</button>
        </form>
        <Link to={isRegister ? '/login' : '/register'}>{isRegister ? 'Already have an account?' : 'Need an account?'}</Link>
      </section>
    </main>
  );
}

function EventsPage() {
  const [events, setEvents] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    apiRequest('/events').then((data) => setEvents(data.events)).catch((err) => setError(err.message));
  }, []);

  return (
    <main className="page">
      <div className="page-heading">
        <p className="eyebrow">Screenings</p>
        <h1>Choose a campus cinema event</h1>
      </div>
      {error && <div className="alert">{error}</div>}
      <div className="event-grid">
        {events.map((event) => (
          <Link className="event-card" key={event.id} to={`/events/${event.id}`}>
            <img src={event.poster_url || 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?auto=format&fit=crop&w=1200&q=80'} alt="" />
            <div>
              <span>{new Date(event.starts_at).toLocaleString()}</span>
              <h3>{event.title}</h3>
              <p>{event.venue}</p>
              <div className="progress"><i style={{ width: `${event.total_seats ? (event.reserved_seats / event.total_seats) * 100 : 0}%` }} /></div>
              <small>{event.reserved_seats}/{event.total_seats} seats reserved</small>
            </div>
          </Link>
        ))}
      </div>
    </main>
  );
}

function EventDetail() {
  const { eventId } = useParams();
  const [event, setEvent] = useState(null);
  const [seats, setSeats] = useState([]);
  const [lock, setLock] = useState(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const navigate = useNavigate();

  async function loadSeats() {
    const data = await apiRequest(`/events/${eventId}/seats`);
    setEvent(data.event);
    setSeats(data.seats);
    const mine = data.seats.find((seat) => seat.status === 'selected_by_me' && seat.lock);
    if (mine) {
      setLock(mine.lock);
    } else {
      setLock(null);
    }
  }

  useEffect(() => {
    loadSeats().catch((err) => setError(err.message));
  }, [eventId]);

  useEffect(() => {
    if (!lock) return;
    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.floor((new Date(lock.expiresAt).getTime() - Date.now()) / 1000));
      setSecondsLeft(remaining);
      if (remaining === 0) {
        setLock(null);
        loadSeats().catch(() => {});
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [lock]);

  async function selectSeat(seat) {
    setError('');
    setSuccess('');
    try {
      if (seat.status === 'selected_by_me' && seat.lock) {
        await apiRequest(`/locks/${seat.lock.lockId}`, {
          method: 'DELETE',
          body: { eventId, seatId: seat.id }
        });
        setLock(null);
        setSecondsLeft(0);
        await loadSeats();
        return;
      }

      const data = await apiRequest('/locks', { method: 'POST', body: { eventId, seatId: seat.id } });
      setLock(data.lock);
      setSecondsLeft(data.lock.ttlSeconds);
      await loadSeats();
    } catch (err) {
      setError(err.message);
      await loadSeats().catch(() => {});
    }
  }

  async function checkout() {
    if (!lock) return;
    setError('');
    try {
      await apiRequest('/reservations', {
        method: 'POST',
        body: { eventId: lock.eventId, seatId: lock.seatId, lockId: lock.lockId }
      });
      navigate('/reservation-success');
    } catch (err) {
      setError(err.message);
    }
  }

  const grouped = seats.reduce((acc, seat) => {
    acc[seat.rowLabel] = acc[seat.rowLabel] || [];
    acc[seat.rowLabel].push(seat);
    return acc;
  }, {});

  return (
    <main className="page booking-page">
      <section className="screening-info">
        <div>
          <p className="eyebrow">Seat Selection</p>
          <h1>{event?.title || 'Loading event'}</h1>
          <p>{event?.venue} · {event?.starts_at && new Date(event.starts_at).toLocaleString()}</p>
        </div>
        <div className="timer-card">
          <span>Lock countdown</span>
          <strong>{lock ? `${String(Math.floor(secondsLeft / 60)).padStart(2, '0')}:${String(secondsLeft % 60).padStart(2, '0')}` : '--:--'}</strong>
        </div>
      </section>

      {error && <div className="alert">{error}</div>}
      {success && <div className="success">{success}</div>}

      <section className="cinema-hall">
        <div className="screen">SCREEN</div>
        {Object.entries(grouped).map(([row, rowSeats]) => (
          <div className="seat-row" key={row}>
            <span>{row}</span>
            <div className="seats">
              {rowSeats.map((seat) => (
                <button
                  key={seat.id}
                  className={`seat ${seat.status}`}
                  disabled={seat.status === 'reserved' || seat.status === 'locked'}
                  onClick={() => selectSeat(seat)}
                  title={`${seat.rowLabel}${seat.seatNumber} ${seat.status}`}
                >
                  {seat.seatNumber}
                </button>
              ))}
            </div>
          </div>
        ))}
        <div className="legend">
          <span><i className="dot available" />Available</span>
          <span><i className="dot locked" />Locked</span>
          <span><i className="dot reserved" />Reserved</span>
          <span><i className="dot selected_by_me" />Your lock</span>
        </div>
      </section>

      <aside className="checkout-panel">
        <h2>Mock Checkout</h2>
        <p className="muted">Complete checkout before the Redis TTL expires.</p>
        <button className="button primary" disabled={!lock || secondsLeft <= 0} onClick={checkout}>Confirm Reservation</button>
      </aside>
    </main>
  );
}

function MyReservations() {
  const [reservations, setReservations] = useState([]);
  useEffect(() => {
    apiRequest('/reservations/mine').then((data) => setReservations(data.reservations)).catch(() => {});
  }, []);
  return (
    <main className="page">
      <h1>My Tickets</h1>
      <div className="ticket-list">
        {reservations.map((ticket) => (
          <article className="ticket" key={ticket.id}>
            <strong>{ticket.title}</strong>
            <span>{ticket.row_label}{ticket.seat_number}</span>
            <small>{new Date(ticket.starts_at).toLocaleString()} · {ticket.venue}</small>
          </article>
        ))}
      </div>
    </main>
  );
}

function AdminDashboard() {
  const [data, setData] = useState(null);
  const [form, setForm] = useState({ title: '', description: '', venue: '', startsAt: '', posterUrl: '', rows: 6, seatsPerRow: 10 });
  const [error, setError] = useState('');

  async function load() {
    const payload = await apiRequest('/dashboard/summary');
    setData(payload);
  }

  useEffect(() => {
    load().catch((err) => setError(err.message));
  }, []);

  async function createEvent(event) {
    event.preventDefault();
    setError('');
    try {
      await apiRequest('/events', {
        method: 'POST',
        body: { ...form, rows: Number(form.rows), seatsPerRow: Number(form.seatsPerRow) }
      });
      setForm({ title: '', description: '', venue: '', startsAt: '', posterUrl: '', rows: 6, seatsPerRow: 10 });
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  const cards = data?.summary ? [
    ['Users', data.summary.totalUsers],
    ['Events', data.summary.totalEvents],
    ['Reservations', data.summary.totalReservations],
    ['Active Locks', data.summary.activeLocks],
    ['Reservation Rate', `${data.summary.reservationRate}%`]
  ] : [];

  return (
    <main className="page admin-page">
      <div className="page-heading">
        <p className="eyebrow">Admin Dashboard</p>
        <h1>Operational cockpit</h1>
      </div>
      {error && <div className="alert">{error}</div>}
      <section className="stat-grid">
        {cards.map(([label, value]) => <div className="stat-card" key={label}><span>{label}</span><strong>{value}</strong></div>)}
      </section>
      <section className="dashboard-grid">
        <div className="panel chart-panel">
          <h2>Event Occupancy (%)</h2>
          <p className="muted">This shows the percentage of reserved seats, not the number of seats.</p>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={data?.events || []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#332" />
              <XAxis dataKey="title" stroke="#b8a98a" />
              <YAxis stroke="#b8a98a" />
              <Tooltip formatter={(value) => [`${value}%`, 'Occupancy']} contentStyle={{ background: '#15100f', border: '1px solid #3a2a22' }} />
              <Bar dataKey="occupancy" fill="#d4a84f" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <div className="occupancy-list">
            {(data?.events || []).map((event) => (
              <div key={event.id}>
                <span>{event.title}</span>
                <strong>{event.reserved_seats}/{event.total_seats} reserved</strong>
                <em>{event.occupancy}%</em>
              </div>
            ))}
          </div>
        </div>
        <form className="panel form" onSubmit={createEvent}>
          <h2>Create Event</h2>
          <input placeholder="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <textarea placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <input placeholder="Venue" value={form.venue} onChange={(e) => setForm({ ...form, venue: e.target.value })} />
          <input type="datetime-local" onChange={(e) => setForm({ ...form, startsAt: e.target.value ? new Date(e.target.value).toISOString() : '' })} />
          <input placeholder="Poster URL" value={form.posterUrl} onChange={(e) => setForm({ ...form, posterUrl: e.target.value })} />
          <div className="split">
            <input type="number" min="1" max="20" value={form.rows} onChange={(e) => setForm({ ...form, rows: e.target.value })} />
            <input type="number" min="1" max="30" value={form.seatsPerRow} onChange={(e) => setForm({ ...form, seatsPerRow: e.target.value })} />
          </div>
          <button className="button primary">Create</button>
        </form>
      </section>
      <section className="panel">
        <h2>Recent Reservations</h2>
        <div className="table-list">
          {(data?.recentReservations || []).map((reservation) => (
            <div key={reservation.id}>
              <span>{reservation.email}</span>
              <strong>{reservation.title}</strong>
              <span>{reservation.row_label}{reservation.seat_number}</span>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

function Success() {
  return (
    <main className="page success-page">
      <div className="success-orb">✓</div>
      <h1>Reservation confirmed</h1>
      <p>Your seat is permanently stored in PostgreSQL.</p>
      <Link className="button primary" to="/my-reservations">View My Tickets</Link>
    </main>
  );
}

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<AuthPage mode="login" />} />
        <Route path="/register" element={<AuthPage mode="register" />} />
        <Route path="/events" element={<EventsPage />} />
        <Route path="/events/:eventId" element={<Protected><EventDetail /></Protected>} />
        <Route path="/my-reservations" element={<Protected><MyReservations /></Protected>} />
        <Route path="/reservation-success" element={<Protected><Success /></Protected>} />
        <Route path="/admin" element={<Protected adminOnly><AdminDashboard /></Protected>} />
      </Routes>
    </Layout>
  );
}
