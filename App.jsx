import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock3,
  Compass,
  History,
  Home,
  Info,
  Leaf,
  LoaderCircle,
  LocateFixed,
  LogOut,
  MapPin,
  MessageCircle,
  Minus,
  Navigation,
  Phone,
  Plus,
  Radio,
  RefreshCw,
  Route,
  Share2,
  Shield,
  ShieldCheck,
  Sparkles,
  Star,
  Sun,
  Users,
  Wallet,
  WifiOff,
  X,
  CarFront,
} from "lucide-react";
import serviceConfig from "../functions/config.json";
import {
  api,
  watchDrivers,
  watchHistory,
  watchRequests,
  watchRide,
  getPortrait,
} from "./api";
import { isEmulator, runtime } from "./runtime";
import { useSession } from "./useSession";
import { useGeolocation } from "./useGeolocation";
import {
  money,
  formatDate,
  estimateFare,
  haversine,
  initials,
  relativeTime,
  timestamp,
} from "./utils";
import AuthDialog from "./components/AuthDialog";
import MapView from "./components/MapView";
import ChatPanel from "./components/ChatPanel";
import DriverApplication from "./components/DriverApplication";
import AdminPanel from "./components/AdminPanel";
import InstallApp from "./components/InstallApp";
import "./styles.css";

const ACTIVE_STATUSES = ["requested", "accepted", "arrived", "in_progress"];
const STATUS_LABELS = {
  requested: "Finding your driver",
  accepted: "Your driver is on the way",
  arrived: "Your driver has arrived",
  in_progress: "Enjoy the ride",
  completed: "You have arrived",
  cancelled: "Ride cancelled",
};
const DRIVER_STATUS_LABELS = {
  accepted: "Head to your passenger",
  arrived: "Ready for pickup",
  in_progress: "Ride in progress",
  completed: "Ride complete",
  cancelled: "Ride cancelled",
};

function Icon({ icon: IconComponent, size = 20, ...props }) {
  return (
    <IconComponent
      size={size}
      strokeWidth={1.8}
      aria-hidden="true"
      {...props}
    />
  );
}

function Brand({ compact = false }) {
  return (
    <div className={`brand ${compact ? "brand-compact" : ""}`}>
      <span className="brand-symbol" aria-hidden="true">
        <Route size={25} strokeWidth={2.4} />
      </span>
      {!compact && (
        <span className="brand-wordmark">
          keimoes<span>rides</span>
          <i />
        </span>
      )}
    </div>
  );
}

function CarIllustration({ dark = false }) {
  return (
    <svg
      className="car-illustration"
      viewBox="0 0 240 100"
      fill="none"
      aria-hidden="true"
    >
      <ellipse
        cx="126"
        cy="83"
        rx="91"
        ry="7"
        fill={dark ? "#0a241c" : "#d6d9c9"}
        opacity=".55"
      />
      <path
        d="M44 51 63 26c5-7 11-10 21-10h55c10 0 18 3 24 9l25 23 23 6c7 2 11 7 11 14v8H27V64c0-6 6-11 17-13Z"
        fill={dark ? "#d5f364" : "#163b2e"}
      />
      <path
        d="m72 29-16 21h45V27H82c-4 0-7 0-10 2Zm39-2v23h61l-20-18c-4-4-9-5-15-5h-26Z"
        fill={dark ? "#254b36" : "#b8cebd"}
      />
      <path
        d="M111 28v45M52 56h135"
        stroke={dark ? "#708a35" : "#102c23"}
        strokeWidth="2"
      />
      <path
        d="M32 63h16m149 0h19"
        stroke={dark ? "#fff5b7" : "#e6eea2"}
        strokeWidth="6"
        strokeLinecap="round"
      />
      <rect
        x="117"
        y="55"
        width="12"
        height="3"
        rx="1.5"
        fill={dark ? "#507330" : "#95aa95"}
      />
      <circle cx="66" cy="76" r="16" fill="#17251f" />
      <circle cx="66" cy="76" r="8" fill="#e1e4d5" />
      <circle cx="183" cy="76" r="16" fill="#17251f" />
      <circle cx="183" cy="76" r="8" fill="#e1e4d5" />
      <circle cx="66" cy="76" r="3" fill="#899685" />
      <circle cx="183" cy="76" r="3" fill="#899685" />
    </svg>
  );
}

function Portrait({ path, name, size = "normal" }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let cancelled = false;
    let objectUrl;
    setUrl(null);
    if (path)
      getPortrait(path)
        .then((value) => {
          objectUrl = value;
          if (cancelled) URL.revokeObjectURL(value);
          else setUrl(value);
        })
        .catch(() => {});
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path]);
  return (
    <span className={`avatar avatar-${size}`}>
      {url ? (
        <img src={url} alt={`${name}'s driver portrait`} />
      ) : (
        initials(name || "Driver")
      )}
    </span>
  );
}

function Modal({
  title,
  subtitle,
  onClose,
  children,
  wide = false,
  className = "",
}) {
  const headingId = useRef(`dialog-${Math.random().toString(36).slice(2)}`);
  const panelRef = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();
    function onKeyDown(event) {
      if (event.key === "Escape") closeRef.current();
      if (event.key === "Tab" && panelRef.current) {
        const focusable = [
          ...panelRef.current.querySelectorAll(
            'button, a[href], input, select, textarea, [tabindex="0"]',
          ),
        ].filter(
          (element) => !element.disabled && element.offsetParent !== null,
        );
        if (!focusable.length) {
          event.preventDefault();
          return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (
          event.shiftKey &&
          (document.activeElement === first ||
            document.activeElement === panelRef.current)
        ) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      previousFocus?.focus?.();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId.current}
        className={`modal ${wide ? "modal-wide" : ""} ${className}`}
      >
        <header className="modal-header">
          <div>
            <h2 id={headingId.current}>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <Icon icon={X} />
          </button>
        </header>
        <div className="modal-body">{children}</div>
      </section>
    </div>
  );
}

function StatusPill({ status }) {
  return (
    <span className={`chip status-${status}`}>
      <i />
      {status?.replaceAll("_", " ") || "Unknown"}
    </span>
  );
}

function TripRoute({ ride, compact = false }) {
  return (
    <div className={`trip-route ${compact ? "trip-route-compact" : ""}`}>
      <div>
        <span className="route-dot" />
        <div>
          <small>Pickup</small>
          <strong>{ride.pickup?.label || "Pickup pin"}</strong>
        </div>
      </div>
      <span className="trip-route-line" />
      <div>
        <span className="route-square" />
        <div>
          <small>Destination</small>
          <strong>{ride.dropoff?.label || "Destination pin"}</strong>
        </div>
      </div>
    </div>
  );
}

function RatingForm({ ride, onDone, onError }) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault();
    if (!rating || busy) return;
    if (!runtime.canUseSensitiveFeatures) {
      onError(
        runtime.securityWarning ||
          runtime.configurationError ||
          "Open the secure Keimoes Rides website before submitting feedback.",
      );
      return;
    }
    setBusy(true);
    try {
      await api.rateRide({ rideId: ride.id, rating, comment });
      onDone();
    } catch (error) {
      onError(error.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="rating-form stack">
      <div className="rating-stars" role="group" aria-label="Rate your ride">
        {[1, 2, 3, 4, 5].map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setRating(value)}
            aria-label={`${value} star${value > 1 ? "s" : ""}`}
            aria-pressed={rating === value}
            className={value <= rating ? "selected" : ""}
          >
            <Star size={34} fill={value <= rating ? "currentColor" : "none"} />
          </button>
        ))}
      </div>
      <label className="field">
        Anything to add? <span className="optional">Optional</span>
        <textarea
          maxLength={300}
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          placeholder="Tell us how your ride went"
          rows={3}
        />
      </label>
      <button className="btn btn-primary" disabled={!rating || busy}>
        {busy ? (
          <Icon icon={LoaderCircle} className="spin" />
        ) : (
          <Icon icon={Check} />
        )}
        Submit rating
      </button>
    </form>
  );
}

export default function App() {
  const session = useSession();
  const geo = useGeolocation();
  const mapRef = useRef(null);
  const mapSectionRef = useRef(null);
  const [auth, setAuth] = useState(null);
  const [drawer, setDrawer] = useState(null);
  const [online, setOnline] = useState(navigator.onLine);
  const [toasts, setToasts] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [driversState, setDriversState] = useState("idle");
  const [requestsState, setRequestsState] = useState("idle");
  const [historyState, setHistoryState] = useState("idle");
  const [requests, setRequests] = useState([]);
  const [history, setHistory] = useState([]);
  const [ride, setRide] = useState(null);
  const [rideLoading, setRideLoading] = useState(false);
  const [dataError, setDataError] = useState("");
  const [pickup, setPickup] = useState(null);
  const [destinationId, setDestinationId] = useState("central");
  const [customDropoff, setCustomDropoff] = useState(null);
  const [passengers, setPassengers] = useState(1);
  const [rideType, setRideType] = useState("shared");
  const [note, setNote] = useState("");
  const [selectionMode, setSelectionMode] = useState(null);
  const [usePositionForPickup, setUsePositionForPickup] = useState(false);
  const [busy, setBusy] = useState("");
  const [wantsOnline, setWantsOnline] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [completeOpen, setCompleteOpen] = useState(false);
  const [completeConfirmed, setCompleteConfirmed] = useState(false);
  const [ratingRide, setRatingRide] = useState(null);
  const [accountName, setAccountName] = useState("");
  const [accountPhone, setAccountPhone] = useState("");
  const [clock, setClock] = useState(new Date());
  const lastPublish = useRef(0);
  const lastLocationError = useRef("");
  const requestId = useRef(null);
  const previousActiveRideId = useRef(null);
  const profile = session.profile;
  const isDriver = profile?.role === "driver";
  const ownDriver = drivers.find(
    (driver) =>
      driver.uid === session.user?.uid || driver.id === session.user?.uid,
  );
  const driverOnline = ownDriver?.online === true;
  const approved = session.application?.status === "approved";
  const active = ride && ACTIVE_STATUSES.includes(ride.status);
  const activeRideId = runtime.canUseSensitiveFeatures
    ? profile?.activeRideId
    : null;
  const dropoff =
    destinationId === "custom"
      ? customDropoff
      : serviceConfig.destinations.find((item) => item.id === destinationId);
  const quote = estimateFare({
    pickup,
    dropoff,
    destinationId,
    passengers,
    rideType,
  });
  const completedHistory = history.filter(
    (item) => item.status === "completed",
  );
  const earnings = completedHistory.reduce(
    (sum, item) => sum + (Number(item.fare) || 0),
    0,
  );
  const verifiedOnline = drivers.filter((driver) => {
    const lastSeen = timestamp(driver.lastSeen);
    return (
      driver.online &&
      driver.verified &&
      !driver.busy &&
      lastSeen &&
      clock.getTime() - lastSeen.getTime() <= 90000
    );
  });
  const driverLocationTime = timestamp(
    ride?.driverLocation?.updatedAt || ride?.driverLocation?.timestamp,
  );
  const driverLocationFresh =
    driverLocationTime &&
    clock.getTime() - driverLocationTime.getTime() <= 45000;
  const openAuth = useCallback(
    (initialMode = "login", initialRole = "passenger") =>
      setAuth({ initialMode, initialRole }),
    [],
  );
  const closeDrawer = useCallback(() => setDrawer(null), []);
  const notify = useCallback((message, type = "error") => {
    const value =
      typeof message === "string"
        ? message
        : message?.message || "Something went wrong. Please try again.";
    const id = crypto.randomUUID();
    setToasts((current) =>
      [
        ...current.filter((item) => item.message !== value),
        { id, message: value, type },
      ].slice(-3),
    );
    setTimeout(
      () => setToasts((current) => current.filter((item) => item.id !== id)),
      type === "error" ? 10000 : 6000,
    );
  }, []);
  const success = useCallback(
    (message) => notify(message, "success"),
    [notify],
  );

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    const interval = setInterval(() => setClock(new Date()), 30000);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
      clearInterval(interval);
    };
  }, []);
  useEffect(() => {
    setDrivers([]);
    setDataError("");
    setDriversState("idle");
    if (!runtime.canUseSensitiveFeatures || !session.user || !profile) return;
    setDriversState("loading");
    return watchDrivers(
      (rows) => {
        setDrivers(rows);
        setDriversState("ready");
      },
      (error) => {
        setDriversState("error");
        setDataError(
          error.message || "Driver availability could not be loaded.",
        );
      },
    );
  }, [session.user?.uid, profile?.role]);
  useEffect(() => {
    setHistory([]);
    setHistoryState("idle");
    if (!runtime.canUseSensitiveFeatures || !session.user || !profile) return;
    setHistoryState("loading");
    return watchHistory(
      session.user.uid,
      profile.role,
      (rows) => {
        setHistory(rows);
        setHistoryState("ready");
      },
      (error) => {
        setHistoryState("error");
        setDataError(error.message || "Your ride history could not be loaded.");
      },
    );
  }, [session.user?.uid, profile?.role]);
  useEffect(() => {
    setRide(null);
    setRideLoading(Boolean(activeRideId));
    if (!runtime.canUseSensitiveFeatures || !session.user || !activeRideId)
      return;
    return watchRide(
      activeRideId,
      (value) => {
        setRide(value);
        setRideLoading(false);
        if (value?.status === "completed" && !isDriver && !value.rating)
          setRatingRide(value);
      },
      (error) => {
        setRideLoading(false);
        setDataError(error.message || "Your active ride could not be loaded.");
      },
    );
  }, [session.user?.uid, activeRideId, isDriver]);
  useEffect(() => {
    if (activeRideId) previousActiveRideId.current = activeRideId;
    else if (previousActiveRideId.current) {
      const completed = history.find(
        (item) =>
          item.id === previousActiveRideId.current &&
          item.status === "completed",
      );
      if (completed) {
        if (!isDriver && !completed.rating) setRatingRide(completed);
        previousActiveRideId.current = null;
      } else if (
        history.some(
          (item) =>
            item.id === previousActiveRideId.current &&
            item.status === "cancelled",
        )
      )
        previousActiveRideId.current = null;
    }
  }, [activeRideId, history, isDriver]);
  useEffect(() => {
    if (selectionMode && window.matchMedia("(max-width: 760px)").matches)
      mapSectionRef.current?.scrollIntoView({
        block: "start",
        behavior: "smooth",
      });
  }, [selectionMode]);
  useEffect(() => {
    setRequests([]);
    setRequestsState("idle");
    if (!runtime.canUseSensitiveFeatures || !isDriver || !approved) return;
    setRequestsState("loading");
    return watchRequests(
      (rows) => {
        setRequests(rows);
        setRequestsState("ready");
      },
      (error) => {
        setRequestsState("error");
        setDataError(error.message || "Ride requests could not be loaded.");
      },
    );
  }, [session.user?.uid, isDriver, approved]);
  useEffect(() => {
    setAccountName(profile?.name || "");
    setAccountPhone(profile?.phone || "");
  }, [profile?.name, profile?.phone]);
  useEffect(() => {
    if (usePositionForPickup && geo.position && !geo.position.stale) {
      setPickup({
        lat: geo.position.lat,
        lng: geo.position.lng,
        label: "My current location",
      });
      setUsePositionForPickup(false);
      setSelectionMode(null);
      mapRef.current?.recenter(geo.position);
    }
  }, [geo.position, usePositionForPickup]);
  useEffect(() => {
    if (
      !runtime.canUseSensitiveFeatures ||
      !geo.position ||
      geo.position.stale ||
      !session.user?.emailVerified ||
      (!active && !(isDriver && driverOnline))
    )
      return;
    // Keep the latest sample at the throttle boundary. Dropping a sample here
    // loses a driver's final movement when watchPosition then becomes quiet.
    let cancelled = false;
    const wait = Math.max(0, 8000 - (Date.now() - lastPublish.current));
    const timer = window.setTimeout(() => {
      if (
        cancelled ||
        document.visibilityState === "hidden" ||
        Date.now() - geo.position.timestamp > 45000
      )
        return;
      lastPublish.current = Date.now();
      api
        .publishLocation({
          location: {
            lat: geo.position.lat,
            lng: geo.position.lng,
            accuracy: geo.position.accuracy,
          },
          ...(activeRideId ? { rideId: activeRideId } : {}),
        })
        .then(() => {
          lastLocationError.current = "";
        })
        .catch((error) => {
          if (!cancelled && lastLocationError.current !== error.message) {
            lastLocationError.current = error.message;
            notify(error.message);
          }
        });
    }, wait);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    geo.position,
    active,
    activeRideId,
    isDriver,
    driverOnline,
    session.user?.uid,
    session.user?.emailVerified,
    notify,
  ]);
  useEffect(() => {
    if (!session.user) {
      setDrawer(null);
      setRide(null);
      setRatingRide(null);
      setWantsOnline(false);
      requestId.current = null;
      previousActiveRideId.current = null;
      geo.stop();
    }
  }, [session.user?.uid]);
  useEffect(() => {
    if (!wantsOnline || !geo.position || geo.position.stale || busy) return;
    setWantsOnline(false);
    changeAvailability(true);
  }, [wantsOnline, geo.position, busy]);

  function checkRuntime() {
    if (runtime.canUseSensitiveFeatures) return true;
    notify(
      runtime.securityWarning ||
        runtime.configurationError ||
        "Open the secure Keimoes Rides website to sign in, book and share your location.",
      "info",
    );
    return false;
  }
  function startLocation() {
    if (!checkRuntime()) return false;
    geo.start();
    return true;
  }
  function useMyLocation() {
    if (!checkRuntime()) return;
    setUsePositionForPickup(true);
    if (geo.position && !geo.position.stale) {
      setPickup({
        lat: geo.position.lat,
        lng: geo.position.lng,
        label: "My current location",
      });
      setUsePositionForPickup(false);
      mapRef.current?.recenter(geo.position);
    }
    startLocation();
  }
  function choosePoint(point) {
    if (!selectionMode || active) return;
    const pin = {
      lat: point.lat,
      lng: point.lng,
      label:
        point.label ||
        `${selectionMode === "pickup" ? "Pickup" : "Destination"} pin · ${point.lat.toFixed(4)}, ${point.lng.toFixed(4)}`,
    };
    if (selectionMode === "pickup") {
      setPickup(pin);
      setUsePositionForPickup(false);
    } else {
      setCustomDropoff(pin);
      setDestinationId("custom");
    }
    setSelectionMode(null);
    if (window.matchMedia("(max-width: 760px)").matches)
      document
        .querySelector(".location-fields")
        ?.scrollIntoView({ block: "center", behavior: "smooth" });
  }
  function requireVerified() {
    if (!checkRuntime()) return false;
    if (!session.user || !profile) {
      openAuth();
      return false;
    }
    if (!session.user.emailVerified) {
      openAuth();
      notify(
        "Verify your email before requesting or accepting a ride.",
        "info",
      );
      return false;
    }
    return true;
  }
  async function bookRide() {
    if (!requireVerified()) return;
    if (!online) {
      notify("You are offline. Reconnect before requesting a ride.");
      return;
    }
    if (isDriver) return;
    if (!pickup) {
      setSelectionMode("pickup");
      notify(
        "Choose your pickup on the map or use your current location.",
        "info",
      );
      return;
    }
    if (!dropoff) {
      setSelectionMode("dropoff");
      notify("Choose your destination on the map.", "info");
      return;
    }
    if (
      haversine(serviceConfig.center, pickup) > serviceConfig.serviceRadiusKm ||
      haversine(serviceConfig.center, dropoff) > serviceConfig.serviceRadiusKm
    ) {
      notify(
        `Choose pickup and destination points within ${serviceConfig.serviceRadiusKm} km of Keimoes.`,
      );
      return;
    }
    setBusy("request");
    if (!requestId.current) requestId.current = crypto.randomUUID();
    try {
      await api.requestRide({
        requestId: requestId.current,
        pickup,
        destinationId,
        ...(destinationId === "custom" ? { dropoff } : {}),
        passengers,
        rideType,
        note,
      });
      requestId.current = null;
      setSelectionMode(null);
      success("Ride requested. Waiting for an available verified driver.");
    } catch (error) {
      notify(error.message);
    } finally {
      setBusy("");
    }
  }
  async function changeAvailability(next) {
    if (!requireVerified()) return;
    if (next && (!geo.position || geo.position.stale)) {
      setWantsOnline(true);
      startLocation();
      return;
    }
    setBusy("availability");
    try {
      await api.setAvailability({
        online: next,
        ...(next
          ? {
              location: {
                lat: geo.position.lat,
                lng: geo.position.lng,
                accuracy: geo.position.accuracy,
              },
            }
          : {}),
      });
      if (next) startLocation();
      success(
        next
          ? "You are online and ready for requests."
          : "You are now offline.",
      );
    } catch (error) {
      notify(error.message);
    } finally {
      setBusy("");
    }
  }
  async function acceptRequest(request) {
    if (!requireVerified()) return;
    if (!geo.position || geo.position.stale) {
      startLocation();
      notify(
        "Allow a fresh location reading, then accept the request.",
        "info",
      );
      return;
    }
    setBusy(request.id);
    try {
      await api.acceptRide({
        rideId: request.id,
        location: {
          lat: geo.position.lat,
          lng: geo.position.lng,
          accuracy: geo.position.accuracy,
        },
      });
      success("Ride accepted. Your passenger can now see your location.");
    } catch (error) {
      notify(error.message);
    } finally {
      setBusy("");
    }
  }
  async function transition(action) {
    if (!checkRuntime()) return;
    if (!ride || busy) return;
    if (action === "cancel" && cancelReason.trim().length < 3) {
      notify("Please enter a short reason for cancellation.");
      return;
    }
    setBusy(action);
    try {
      await api.transitionRide({
        rideId: ride.id,
        action,
        ...(action === "cancel" ? { reason: cancelReason.trim() } : {}),
      });
      if (action === "complete" || action === "cancel") {
        setCompleteOpen(false);
        setCompleteConfirmed(false);
        setCancelOpen(false);
        setCancelReason("");
      }
      success(
        action === "cancel"
          ? "Ride cancelled. Your trip has been closed."
          : action === "complete"
            ? "Ride complete. Thank you for driving with Keimoes Rides."
            : action === "arrive"
              ? "Your passenger has been notified that you have arrived."
              : "Ride started. Travel safely.",
      );
    } catch (error) {
      notify(error.message);
    } finally {
      setBusy("");
    }
  }
  async function shareRide() {
    if (!ride) return;
    const text = `My Keimoes Rides trip\nTrip: ${ride.id}\n${ride.pickup?.label} → ${ride.dropoff?.label}\nStatus: ${STATUS_LABELS[ride.status]}\n${ride.driver ? `Driver: ${ride.driver.name}\nVehicle: ${ride.driver.vehicle?.color || ""} ${ride.driver.vehicle?.model || ""}, ${ride.driver.vehicle?.plate || ""}\n` : "Waiting for a driver\n"}${ride.driverLocation ? `Latest driver location: https://www.google.com/maps?q=${ride.driverLocation.lat},${ride.driverLocation.lng}\n` : ""}Cash fare: ${money(ride.fare)}\nThis is a trip summary, not a live tracking link. In an emergency call 10111.`;
    try {
      if (navigator.share)
        await navigator.share({ title: "My Keimoes Rides trip", text });
      else {
        await navigator.clipboard.writeText(text);
        success("Trip details copied. Share them with someone you trust.");
      }
    } catch (error) {
      if (error.name !== "AbortError")
        notify(
          "Sharing is unavailable. You can copy your trip details from this screen.",
        );
    }
  }
  async function saveAccount(event) {
    event.preventDefault();
    if (!checkRuntime()) return;
    setBusy("profile");
    try {
      await session.saveProfile({
        name: accountName,
        phone: accountPhone,
        role: profile.role,
      });
      success("Your profile has been updated.");
    } catch (error) {
      notify(error.message);
    } finally {
      setBusy("");
    }
  }

  const currentMapPickup = active ? ride.pickup : isDriver ? null : pickup;
  const currentMapDropoff = active ? ride.dropoff : isDriver ? null : dropoff;
  const greeting = profile?.name?.split(" ")[0];
  const localTime = new Intl.DateTimeFormat("en-ZA", {
    timeZone: "Africa/Johannesburg",
    hour: "2-digit",
    minute: "2-digit",
  }).format(clock);

  function activeRidePanel() {
    return (
      <div className="active-ride stack">
        <div className="section-eyebrow">
          <span className="live-dot" /> YOUR LIVE RIDE{" "}
          <span className="trip-short-id">
            #{ride.id.slice(0, 7).toUpperCase()}
          </span>
        </div>
        <div className="active-title">
          <h1>
            {isDriver
              ? DRIVER_STATUS_LABELS[ride.status]
              : STATUS_LABELS[ride.status]}
          </h1>
          <p>
            {ride.status === "requested"
              ? "Your request is visible to verified drivers. Availability is never guaranteed."
              : isDriver
                ? "Keep this screen open and location sharing on during your trip."
                : "Follow your ride here. Check the driver and number plate before you get in."}
          </p>
        </div>
        <div
          className="ride-progress"
          aria-label={`Ride status: ${ride.status.replaceAll("_", " ")}`}
        >
          {["requested", "accepted", "arrived", "in_progress"].map(
            (step, index) => (
              <div
                key={step}
                className={
                  ["requested", "accepted", "arrived", "in_progress"].indexOf(
                    ride.status,
                  ) >= index
                    ? "done"
                    : ""
                }
              >
                <span>
                  {["requested", "accepted", "arrived", "in_progress"].indexOf(
                    ride.status,
                  ) > index ? (
                    <Check size={12} />
                  ) : (
                    index + 1
                  )}
                </span>
                <small>
                  {["Requested", "Matched", "Pickup", "On trip"][index]}
                </small>
              </div>
            ),
          )}
        </div>
        {!isDriver && ride.driver && (
          <div className="driver-profile card">
            <div className="driver-profile-top">
              <Portrait
                path={ride.driver.portraitPath}
                name={ride.driver.name}
                size="large"
              />
              <div>
                <span className="verified-label">
                  <ShieldCheck size={14} /> Manually verified
                </span>
                <h3>{ride.driver.name}</h3>
                <p>
                  {ride.driver.vehicle?.color} {ride.driver.vehicle?.model}
                </p>
              </div>
            </div>
            <div className="vehicle-strip">
              <span className="number-plate">
                {ride.driver.vehicle?.plate || "Plate unavailable"}
              </span>
              {ride.driver.phone && (
                <a
                  className="icon-button"
                  href={`tel:${ride.driver.phone}`}
                  aria-label={`Call ${ride.driver.name}`}
                >
                  <Icon icon={Phone} size={18} />
                </a>
              )}
            </div>
            <p
              className={`location-freshness ${!driverLocationFresh ? "location-is-stale" : ""}`}
            >
              <span
                className={driverLocationFresh ? "live-dot" : "muted-dot"}
              />
              {driverLocationTime
                ? `${driverLocationFresh ? "Driver location updated" : "Location may be out of date · updated"} ${relativeTime(driverLocationTime)}`
                : "Waiting for a fresh driver location"}
            </p>
          </div>
        )}
        {isDriver && (
          <div className="passenger-profile card">
            <span className="avatar">
              {initials(ride.passenger?.name || "Passenger")}
            </span>
            <div>
              <small>Your passenger</small>
              <h3>{ride.passenger?.name || "Passenger"}</h3>
              <p>
                {ride.passengers} passenger{ride.passengers > 1 ? "s" : ""} ·{" "}
                {ride.rideType === "express"
                  ? "Private express"
                  : "Shared ride"}
              </p>
            </div>
            {ride.passenger?.phone && (
              <a
                className="icon-button"
                href={`tel:${ride.passenger.phone}`}
                aria-label="Call passenger"
              >
                <Icon icon={Phone} />
              </a>
            )}
          </div>
        )}
        <TripRoute ride={ride} />
        {ride.note && (
          <div className="ride-note">
            <MessageCircle size={16} />
            <p>{ride.note}</p>
          </div>
        )}
        <div className="active-fare">
          <div>
            <small>Pay your driver in cash</small>
            <strong>{money(ride.fare)}</strong>
          </div>
          <span className="chip">
            <Wallet size={14} /> Cash
          </span>
        </div>
        {isDriver && (
          <div className="stack">
            {!geo.tracking && (
              <button className="btn btn-secondary" onClick={startLocation}>
                <Icon icon={LocateFixed} />
                Enable live location sharing
              </button>
            )}
            {ride.status === "accepted" && (
              <button
                className="btn btn-primary btn-lg"
                disabled={Boolean(busy)}
                onClick={() => transition("arrive")}
              >
                <Icon icon={MapPin} />I have arrived at pickup
              </button>
            )}
            {ride.status === "arrived" && (
              <button
                className="btn btn-primary btn-lg"
                disabled={Boolean(busy)}
                onClick={() => transition("start")}
              >
                <Icon icon={Navigation} />
                Start ride
              </button>
            )}
            {ride.status === "in_progress" && (
              <button
                className="btn btn-primary btn-lg"
                disabled={Boolean(busy)}
                onClick={() => setCompleteOpen(true)}
              >
                <Icon icon={CheckCheck} />
                Complete ride
              </button>
            )}
          </div>
        )}
        {!isDriver && !geo.tracking && (
          <button className="btn btn-secondary" onClick={startLocation}>
            <Icon icon={LocateFixed} />
            Share my location with my driver
          </button>
        )}
        {ride.driverId && (
          <ChatPanel ride={ride} user={session.user} onError={notify} />
        )}
        <div className="ride-tools">
          <button onClick={shareRide}>
            <Share2 size={16} /> Share trip
          </button>
          <button onClick={() => setDrawer("safety")}>
            <Shield size={16} /> Safety
          </button>
          {(ride.status !== "in_progress" || isDriver) && (
            <button
              className="text-danger"
              disabled={Boolean(busy)}
              onClick={() => setCancelOpen(true)}
            >
              Cancel ride
            </button>
          )}
        </div>
        {ride.status === "in_progress" && !isDriver && (
          <p className="hint">
            If you need to stop during your trip, speak to your driver. For an
            emergency, call <a href="tel:10111">10111</a>.
          </p>
        )}
      </div>
    );
  }

  function bookingPanel() {
    return (
      <div className="booking-panel">
        <div className="section-eyebrow">
          <span className="sun-badge">
            <Sun size={13} />
          </span>{" "}
          MADE FOR KEIMOES
        </div>
        <h1>
          Your next stop.
          <br />
          <span>Your kind of ride.</span>
        </h1>
        <p className="intro-copy">
          From town errands to the road home.
          <br /> A local ride, just a few taps away.
        </p>
        <div className="booking-form">
          <div className="section-label">
            <span>01</span> Where are we heading?
          </div>
          <div className="location-fields">
            <button
              className={`location-field ${selectionMode === "pickup" ? "selecting" : ""}`}
              onClick={() =>
                setSelectionMode(selectionMode === "pickup" ? null : "pickup")
              }
            >
              <span className="route-dot" />
              <span>
                <small>Your pickup</small>
                <strong>{pickup?.label || "Set pickup location"}</strong>
              </span>
              <ChevronRight size={17} />
            </button>
            <div className="field-connector" />
            <button
              className={`location-field ${selectionMode === "dropoff" ? "selecting" : ""}`}
              onClick={() => {
                setDestinationId("custom");
                setSelectionMode(
                  selectionMode === "dropoff" ? null : "dropoff",
                );
              }}
            >
              <span className="route-square" />
              <span>
                <small>Where to?</small>
                <strong>
                  {dropoff?.name ||
                    dropoff?.label ||
                    "Choose a destination pin"}
                </strong>
              </span>
              <ChevronRight size={17} />
            </button>
          </div>
          <button
            className="location-link"
            onClick={useMyLocation}
            disabled={!runtime.canUseSensitiveFeatures}
          >
            <LocateFixed size={15} />
            {usePositionForPickup
              ? "Waiting for your location…"
              : "Use my current location"}
            <ArrowUpRight size={13} />
          </button>
          {pickup && (
            <label className="field pin-label-field">
              Pickup landmark
              <input
                aria-label="Pickup landmark"
                aria-describedby="pickup-landmark-hint"
                maxLength={100}
                value={pickup.label}
                onChange={(event) =>
                  setPickup((current) => ({
                    ...current,
                    label: event.target.value,
                  }))
                }
                placeholder="For example, outside the library"
              />
              <small id="pickup-landmark-hint" className="hint">
                This label helps your driver. The selected map pin stays the
                same.
              </small>
            </label>
          )}
          {destinationId === "custom" && customDropoff && (
            <label className="field pin-label-field">
              Destination landmark
              <input
                maxLength={100}
                value={customDropoff.label}
                onChange={(event) =>
                  setCustomDropoff((current) => ({
                    ...current,
                    label: event.target.value,
                  }))
                }
                placeholder="For example, the school entrance"
              />
            </label>
          )}
          {selectionMode && (
            <div className="notice notice-info map-pick-notice">
              <MapPin size={17} />
              <span>
                Tap the map to set your {selectionMode}.
                <button onClick={() => setSelectionMode(null)}>Cancel</button>
              </span>
            </div>
          )}
          <div className="destination-grid">
            {serviceConfig.destinations.map((destination) => (
              <button
                key={destination.id}
                className={`destination-card ${destinationId === destination.id ? "selected" : ""}`}
                onClick={() => {
                  setDestinationId(destination.id);
                  setSelectionMode(null);
                }}
                aria-pressed={destinationId === destination.id}
              >
                <span
                  className={`destination-art destination-art-${destination.id}`}
                >
                  <Icon
                    icon={destination.id === "central" ? Home : Sun}
                    size={24}
                  />
                  <span className="destination-check">
                    {destinationId === destination.id ? (
                      <Check size={12} />
                    ) : (
                      <ArrowUpRight size={13} />
                    )}
                  </span>
                </span>
                <strong>{destination.name}</strong>
                <span>
                  {money(serviceConfig.fares[destination.id])}
                  <small> / person</small>
                </span>
              </button>
            ))}
          </div>
          <p className="pin-note">
            Destination pins are approximate. Tap “Where to?” for an exact
            drop-off.
          </p>
          <div className="section-label">
            <span>02</span> Make it your ride
          </div>
          <div className="ride-type-switch" role="group" aria-label="Ride type">
            <button
              className={rideType === "shared" ? "selected" : ""}
              onClick={() => setRideType("shared")}
              aria-pressed={rideType === "shared"}
            >
              <Users size={19} />
              <span>
                Shared ride<small>Priced per person</small>
              </span>
              {rideType === "shared" && <Check size={15} />}
            </button>
            <button
              className={rideType === "express" ? "selected" : ""}
              onClick={() => setRideType("express")}
              aria-pressed={rideType === "express"}
            >
              <Sparkles size={18} />
              <span>
                Express<small>Your private trip</small>
              </span>
              {rideType === "express" && <Check size={15} />}
            </button>
          </div>
          <div className="passenger-picker">
            <div>
              <Users size={18} />
              <span>
                Passengers
                <small>Up to {serviceConfig.maxPassengers} per booking</small>
              </span>
            </div>
            <div className="stepper">
              <button
                disabled={passengers <= 1}
                onClick={() => setPassengers((value) => Math.max(1, value - 1))}
                aria-label="Fewer passengers"
              >
                <Minus size={16} />
              </button>
              <span aria-live="polite">{passengers}</span>
              <button
                disabled={passengers >= serviceConfig.maxPassengers}
                onClick={() =>
                  setPassengers((value) =>
                    Math.min(serviceConfig.maxPassengers, value + 1),
                  )
                }
                aria-label="More passengers"
              >
                <Plus size={16} />
              </button>
            </div>
          </div>
          <label className="booking-note field">
            <span>
              Pickup note <span className="optional">optional</span>
            </span>
            <input
              maxLength={300}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="A landmark, gate colour, anything helpful…"
            />
          </label>
          <div className="fare-card">
            <div className="fare-card-top">
              <span>
                Estimated fare{" "}
                <span
                  className="info-dot"
                  title="The server calculates the final fare when you request. Shared fares are per passenger. Express is R150 per trip."
                >
                  <Info size={14} />
                </span>
              </span>
              <span className="cash-badge">
                <Wallet size={13} />
                CASH
              </span>
            </div>
            <div className="fare-card-price">
              <strong>
                {destinationId === "custom" &&
                (!pickup || !dropoff) &&
                rideType !== "express"
                  ? "—"
                  : money(quote)}
              </strong>
              <span>
                {rideType === "express"
                  ? "one private trip"
                  : `${passengers} passenger${passengers > 1 ? "s" : ""} · shared ride`}
              </span>
              <CarIllustration dark />
            </div>
            <p>
              {rideType === "express"
                ? "R150 flat fare · up to 4 passengers"
                : destinationId === "custom"
                  ? "Distance-based estimate · R25 minimum per person"
                  : `${money(serviceConfig.fares[destinationId])} per person · no booking fee`}
            </p>
          </div>
          <button
            className="btn btn-primary btn-lg request-button"
            disabled={
              !runtime.canUseSensitiveFeatures ||
              Boolean(busy) ||
              rideLoading ||
              Boolean(activeRideId)
            }
            onClick={bookRide}
          >
            {busy === "request" ? (
              <>
                <LoaderCircle size={20} className="spin" />
                Requesting your ride…
              </>
            ) : (
              <>
                <span>
                  {!runtime.canUseSensitiveFeatures
                    ? "Open the secure app to book"
                    : session.user
                      ? !session.user.emailVerified
                        ? "Verify email to book"
                        : "Request a ride"
                      : "Sign in to request a ride"}
                </span>
                <ArrowRight size={20} />
              </>
            )}
          </button>
          <p className="booking-assurance">
            <ShieldCheck size={14} />
            Reviewed drivers. Cash in hand. Keimoes at heart.
          </p>
        </div>
      </div>
    );
  }

  function driverPanel() {
    return (
      <div className="driver-workspace stack">
        <div className="section-eyebrow">
          <CarFront size={14} /> THE DRIVER DESK
        </div>
        <div className="driver-heading">
          <h1>
            Good to see you,
            <br />
            <span>{greeting || "neighbour"}.</span>
          </h1>
          <p>Your next local connection starts here.</p>
        </div>
        {!approved ? (
          <DriverApplication
            session={session}
            onError={notify}
            onSuccess={success}
          />
        ) : (
          <>
            <div
              className={`availability-card ${driverOnline ? "is-online" : ""}`}
            >
              <div className="availability-heading">
                <span className="availability-icon">
                  <Radio size={23} />
                </span>
                <span>
                  <strong>
                    {driverOnline ? "You are online" : "You are offline"}
                  </strong>
                  <small>
                    {driverOnline
                      ? "Ready for real ride requests"
                      : "Go online when you are ready to drive"}
                  </small>
                </span>
                <button
                  className={`toggle-switch ${driverOnline ? "on" : ""}`}
                  role="switch"
                  aria-checked={driverOnline}
                  aria-label="Driver availability"
                  disabled={
                    Boolean(busy) || wantsOnline || Boolean(activeRideId)
                  }
                  onClick={() => changeAvailability(!driverOnline)}
                >
                  <span />
                </button>
              </div>
              {wantsOnline && (
                <p className="hint">
                  <LoaderCircle size={13} className="spin" />
                  Waiting for permission and a fresh GPS reading…{" "}
                  <button
                    className="text-button"
                    onClick={() => setWantsOnline(false)}
                  >
                    Cancel
                  </button>
                </p>
              )}
              <div className="availability-foot">
                <ShieldCheck size={13} /> Manually verified driver <span />
                {geo.tracking ? "GPS sharing on" : "GPS sharing off"}
              </div>
            </div>
            <div className="driver-stats">
              <div>
                <span className="stat-icon">
                  <Wallet size={18} />
                </span>
                <small>Completed cash fares</small>
                <strong>{money(earnings)}</strong>
              </div>
              <div>
                <span className="stat-icon">
                  <CheckCheck size={18} />
                </span>
                <small>Completed rides</small>
                <strong>
                  {completedHistory.length}
                  <span> total</span>
                </strong>
              </div>
            </div>
            <div className="section-heading">
              <h2>Ride requests</h2>
              <span className="chip">
                {requestsState === "ready"
                  ? `${requests.length} waiting`
                  : requestsState === "error"
                    ? "Unavailable"
                    : "Connecting…"}
              </span>
            </div>
            {!driverOnline ? (
              <div className="empty-state driver-empty">
                <span className="empty-illustration">
                  <CarIllustration />
                </span>
                <h3>Your town is out there.</h3>
                <p>
                  Switch on availability to accept requests. We will share your
                  approximate location with signed-in passengers.
                </p>
                <button
                  className="btn btn-primary"
                  onClick={() => changeAvailability(true)}
                  disabled={Boolean(busy) || wantsOnline}
                >
                  <Radio size={17} />
                  Go online
                </button>
              </div>
            ) : requestsState !== "ready" ? (
              <div className="empty-state driver-empty">
                <Info size={26} />
                <h3>
                  {requestsState === "error"
                    ? "Requests are unavailable."
                    : "Connecting to ride requests…"}
                </h3>
                <p>
                  {requestsState === "error"
                    ? "Check your connection and reload to reconnect. Your saved rides remain in your account."
                    : "Waiting for a live connection before showing availability."}
                </p>
                {requestsState === "error" && (
                  <button
                    className="btn btn-secondary"
                    onClick={() => window.location.reload()}
                  >
                    Reconnect
                  </button>
                )}
              </div>
            ) : requests.length === 0 ? (
              <div className="empty-state driver-empty">
                <div className="radar-icon">
                  <Radio size={29} />
                </div>
                <h3>Ready when Keimoes is.</h3>
                <p>
                  No open requests right now. Keep this page open and your
                  location on; new requests will appear here.
                </p>
                <span className="chip">
                  <span className="live-dot" /> Listening for requests
                </span>
              </div>
            ) : (
              <div className="request-list">
                {requests.map((request) => (
                  <article
                    className="request-card card"
                    data-ride-id={request.id}
                    key={request.id}
                  >
                    <div className="request-card-top">
                      <span className="chip">
                        {request.rideType === "express" ? (
                          <Sparkles size={13} />
                        ) : (
                          <Users size={13} />
                        )}
                        {request.rideType === "express" ? "Express" : "Shared"}{" "}
                        · {request.passengers}{" "}
                        {request.passengers === 1 ? "person" : "people"}
                      </span>
                      <strong>{money(request.fare)}</strong>
                    </div>
                    <div className="request-route">
                      <div>
                        <span className="route-dot" />
                        <strong>
                          {request.pickup?.label || "Keimoes pickup area"}
                        </strong>
                      </div>
                      <div>
                        <span className="route-square" />
                        <strong>
                          {request.dropoffLabel || "Keimoes destination"}
                        </strong>
                      </div>
                    </div>
                    <div className="request-card-bottom">
                      <span>
                        <Clock3 size={13} />
                        {relativeTime(request.createdAt)}
                      </span>
                      {geo.position && request.pickup && (
                        <span>
                          ~{haversine(geo.position, request.pickup).toFixed(1)}{" "}
                          km away
                        </span>
                      )}
                    </div>
                    <button
                      className="btn btn-primary"
                      disabled={Boolean(busy) || Boolean(activeRideId)}
                      onClick={() => acceptRequest(request)}
                    >
                      {busy === request.id ? (
                        <LoaderCircle size={17} className="spin" />
                      ) : (
                        <ArrowRight size={17} />
                      )}
                      Accept ride
                    </button>
                    <p className="hint">
                      Exact pickup and contact details are shared after
                      acceptance.
                    </p>
                  </article>
                ))}
              </div>
            )}
          </>
        )}
        <button className="help-card" onClick={() => setDrawer("safety")}>
          <span>
            <ShieldCheck size={22} />
          </span>
          <div>
            <strong>A safer ride starts with you.</strong>
            <small>Review driver safety and emergency help</small>
          </div>
          <ChevronRight size={18} />
        </button>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to booking
      </a>
      <aside className="sidebar" aria-label="Main navigation">
        <button
          className="sidebar-brand"
          onClick={() => {
            setDrawer(null);
            mapRef.current?.recenter(serviceConfig.center);
          }}
          aria-label="Keimoes Rides home"
        >
          <Brand compact />
        </button>
        <nav className="sidebar-nav">
          <button
            className={!drawer ? "active" : ""}
            onClick={() => setDrawer(null)}
            aria-label={isDriver ? "Driver desk" : "Book a ride"}
          >
            <Icon icon={isDriver ? CarFront : Compass} size={23} />
            <span>{isDriver ? "Drive" : "Ride"}</span>
          </button>
          <button
            className={drawer === "history" ? "active" : ""}
            onClick={() => (session.user ? setDrawer("history") : openAuth())}
            aria-label="Ride history"
          >
            <Icon icon={History} size={22} />
            <span>Activity</span>
          </button>
          <button
            className={drawer === "safety" ? "active" : ""}
            onClick={() => setDrawer("safety")}
            aria-label="Safety centre"
          >
            <Icon icon={ShieldCheck} size={22} />
            <span>Safety</span>
          </button>
          <button
            className={drawer === "account" ? "active" : ""}
            onClick={() => (session.user ? setDrawer("account") : openAuth())}
            aria-label="Your account"
          >
            <span className="sidebar-avatar">
              {profile ? initials(profile.name) : <Users size={21} />}
            </span>
            <span>Account</span>
          </button>
          {session.isAdmin && (
            <button
              className={drawer === "admin" ? "active" : ""}
              onClick={() => setDrawer("admin")}
              aria-label="Driver review administration"
            >
              <Icon icon={Shield} size={22} />
              <span>Review</span>
            </button>
          )}
        </nav>
        <div className="sidebar-bottom">
          <span className="local-mark">
            <MapPin size={17} />
            <small>
              KEIMOES
              <br />
              NC, ZA
            </small>
          </span>
          <span className="sidebar-dot" />
        </div>
      </aside>

      <main className="main-content" id="main-content">
        <header className="topbar">
          <Brand />
          <div className="topbar-location">
            <span className="location-orbit">
              <MapPin size={16} />
            </span>
            <span>
              Keimoes, Northern Cape
              <small>Small town. More possibilities.</small>
            </span>
            <span className="topbar-time">{localTime}</span>
          </div>
          <div className="topbar-actions">
            <InstallApp onNotice={success} publicUrl={runtime.publicUrl} />
            {isEmulator && (
              <span className="chip emulator-chip">
                <Info size={13} /> Local demo
              </span>
            )}
            {!session.user ? (
              <>
                <button
                  className="text-button driver-join"
                  onClick={() => openAuth("register", "driver")}
                >
                  Drive with us <ArrowUpRight size={14} />
                </button>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => openAuth()}
                >
                  Sign in <ArrowRight size={15} />
                </button>
              </>
            ) : (
              <button
                className="account-pill"
                onClick={() => setDrawer("account")}
              >
                <span className="avatar avatar-small">
                  {initials(profile?.name || session.user.displayName || "You")}
                </span>
                <span>{greeting || "Your account"}</span>
                <ChevronDown size={14} />
              </button>
            )}
          </div>
        </header>
        {(runtime.securityWarning || runtime.configurationError) && (
          <div
            className="global-notice notice-warning runtime-warning"
            role="alert"
          >
            <ShieldCheck size={23} />
            <div>
              <strong>
                {runtime.securityWarning
                  ? "Open your ride space securely"
                  : "This ride service needs its public configuration"}
              </strong>
              {runtime.securityWarning && <p>{runtime.securityWarning}</p>}
              {runtime.configurationError && (
                <p>{runtime.configurationError}</p>
              )}
              <p>
                You can explore the map and fares here. Sign-in, booking and
                location sharing will be available when this connection is
                ready.
              </p>
              {runtime.publicUrl?.startsWith("https://") && (
                <a className="btn btn-primary" href={runtime.publicUrl}>
                  Open secure Keimoes Rides <ArrowUpRight size={16} />
                </a>
              )}
            </div>
          </div>
        )}
        {!online && (
          <div className="global-notice notice-error" role="status">
            <WifiOff size={17} />
            <span>
              You are offline. Ride updates and booking need an internet
              connection.
            </span>
          </div>
        )}
        {session.user && !session.user.emailVerified && (
          <div className="global-notice notice-warning">
            <Shield size={17} />
            <span>
              One more step for safer rides: verify your email to book or drive.
            </span>
            <button onClick={() => openAuth()}>
              Manage sign-in <ArrowRight size={14} />
            </button>
            <button
              className="icon-button"
              onClick={async () => {
                try {
                  await session.refreshUser();
                  success("Verification status refreshed.");
                } catch (error) {
                  notify(error.message);
                }
              }}
              aria-label="Refresh email verification status"
            >
              <RefreshCw size={15} />
            </button>
          </div>
        )}
        {session.error && (
          <div className="global-notice notice-error">
            <Info size={17} />
            <span>{session.error}</span>
            <button onClick={() => openAuth()}>Manage account</button>
          </div>
        )}
        {dataError && (
          <div className="global-notice notice-error" role="status">
            <Info size={17} />
            <span>{dataError}</span>
            <button
              className="icon-button"
              onClick={() => setDataError("")}
              aria-label="Dismiss connection message"
            >
              <X size={16} />
            </button>
          </div>
        )}
        {geo.error && (
          <div className="global-notice notice-warning">
            <LocateFixed size={17} />
            <span>
              {typeof geo.error === "string" ? geo.error : geo.error.message}{" "}
              {isDriver
                ? "A fresh location is required to go online or accept a ride."
                : "You can still choose pickup and destination pins on the map."}
            </span>
            <button onClick={startLocation}>Try again</button>
          </div>
        )}

        <div className="workspace">
          <section
            className="booking-workspace"
            aria-label={
              active
                ? "Your active ride"
                : isDriver
                  ? "Driver workspace"
                  : "Book your ride"
            }
          >
            {session.loading ? (
              <div className="session-loading">
                <LoaderCircle size={24} className="spin" />
                <p>Getting your ride space ready…</p>
              </div>
            ) : rideLoading || (activeRideId && !ride) ? (
              <div className="session-loading">
                <LoaderCircle size={24} className="spin" />
                <h2>Reconnecting to your trip</h2>
                <p>Your active ride is safely saved to your account.</p>
                {dataError && (
                  <button
                    className="btn btn-secondary"
                    onClick={() => window.location.reload()}
                  >
                    Reconnect
                  </button>
                )}
              </div>
            ) : active ? (
              activeRidePanel()
            ) : isDriver ? (
              driverPanel()
            ) : (
              bookingPanel()
            )}
          </section>
          <section
            ref={mapSectionRef}
            className="map-workspace"
            aria-label="Keimoes live map"
          >
            <div className="map-topline">
              <span>
                <span className="live-dot" />
                {active ? "YOUR TRIP, LIVE" : "A LITTLE CLOSER TO EVERYTHING"}
              </span>
              <span>
                <Compass size={15} /> {serviceConfig.serviceRadiusKm} km service
                area
              </span>
            </div>
            <div
              className={`map-card ${selectionMode ? "map-is-selecting" : ""}`}
            >
              <MapView
                ref={mapRef}
                pickup={currentMapPickup}
                dropoff={currentMapDropoff}
                driverLocation={active ? ride.driverLocation : null}
                drivers={verifiedOnline}
                onPick={choosePoint}
                selectionMode={selectionMode}
                position={geo.position}
                routeVisible={!isDriver || Boolean(active)}
              />
              <div className="map-location-tag">
                <span className="map-location-symbol">
                  <Leaf size={18} />
                </span>
                <span>
                  Keimoes<small>On the banks of possibility.</small>
                </span>
              </div>
              <div className="map-controls">
                <button
                  className="map-control"
                  onClick={() => {
                    if (geo.position) mapRef.current?.recenter(geo.position);
                    else {
                      if (startLocation())
                        success(
                          "Allow location access to centre the map on you.",
                        );
                    }
                  }}
                  aria-label="Centre map on my location"
                >
                  <LocateFixed size={21} />
                </button>
                {(currentMapPickup || currentMapDropoff) && (
                  <button
                    className="map-control"
                    onClick={() => mapRef.current?.fitRoute()}
                    aria-label="Show the whole route"
                  >
                    <Route size={21} />
                  </button>
                )}
              </div>
              {!selectionMode && !active && (
                <div className="map-availability">
                  <span className="availability-dot">
                    <CarFront size={20} />
                  </span>
                  <div>
                    <strong>
                      {!session.user
                        ? "Local rides. Real connections."
                        : driversState === "error"
                          ? "Driver availability unavailable"
                          : driversState !== "ready"
                            ? "Checking driver availability…"
                            : `${verifiedOnline.length} verified driver${verifiedOnline.length === 1 ? "" : "s"} online`}
                    </strong>
                    <span>
                      {!session.user
                        ? "Sign in to see live driver availability"
                        : driversState === "error"
                          ? "Check your connection and reload to reconnect"
                          : driversState !== "ready"
                            ? "Waiting for a live connection"
                            : verifiedOnline.length
                              ? "Availability updates in real time"
                              : "Book a request; availability may change"}
                    </span>
                  </div>
                  {session.user && driversState === "ready" ? (
                    <span className="live-indicator" />
                  ) : (
                    <ShieldCheck size={19} />
                  )}
                </div>
              )}
            </div>
            <div className="map-footer">
              <div className="map-legend">
                <span>
                  <i className="legend-pickup" />
                  Pickup
                </span>
                <span>
                  <i className="legend-destination" />
                  Destination
                </span>
                <span>
                  <CarFront size={13} />
                  Verified driver
                </span>
              </div>
              <button onClick={() => setDrawer("safety")}>
                Good rides start with trust <ArrowUpRight size={14} />
              </button>
            </div>
            <div className="neighbourhood-strip">
              <span className="neighbourhood-icon">
                <Sun size={23} />
              </span>
              <p>
                <strong>Big heart. Small town.</strong>
                <span>
                  Built for the people, streets and everyday journeys of
                  Keimoes.
                </span>
              </p>
              <span className="neighbourhood-coordinate">
                28.7078° S<br />
                20.9705° E
              </span>
            </div>
          </section>
        </div>
        <footer className="app-footer">
          <span>
            Keimoes Rides <span>·</span> A little more connected.
          </span>
          <button onClick={() => setDrawer("about")}>
            Fares & how it works <ArrowUpRight size={13} />
          </button>
        </footer>
      </main>

      {(auth || (session.user && !profile && !session.loading)) && (
        <AuthDialog
          session={session}
          onClose={(result) => {
            setAuth(null);
            if (result?.warning) notify(result.warning, "info");
          }}
          initialMode={auth?.initialMode || "login"}
          initialRole={auth?.initialRole || "passenger"}
        />
      )}

      {drawer === "history" && (
        <Modal
          title="Your journeys"
          subtitle={
            isDriver
              ? "Completed rides, cash fares and your recent activity."
              : "Every local journey, all in one place."
          }
          onClose={closeDrawer}
          wide
        >
          <div className="history-summary">
            <span>
              <Route size={21} />
              <strong>{completedHistory.length}</strong> completed ride
              {completedHistory.length === 1 ? "" : "s"}
            </span>
            <span>
              <Wallet size={20} />
              <strong>{money(earnings)}</strong>
              {isDriver ? "cash fares" : "completed fares"}
            </span>
          </div>
          {historyState !== "ready" ? (
            <div className="empty-state">
              <Info size={28} />
              <h3>
                {historyState === "error"
                  ? "History is unavailable."
                  : "Loading your journeys…"}
              </h3>
              <p>
                {historyState === "error"
                  ? "Check your connection and reload to reconnect. Your trip records are saved to your account."
                  : "Getting the latest trip records for your account."}
              </p>
            </div>
          ) : history.length ? (
            <div className="history-list">
              {history.map((item) => (
                <article
                  className="history-item"
                  data-ride-id={item.id}
                  key={item.id}
                >
                  <div className="history-item-top">
                    <span className="history-icon">
                      <CarFront size={23} />
                    </span>
                    <div>
                      <h3>{item.dropoff?.label || "Keimoes ride"}</h3>
                      <p>
                        {formatDate(item.createdAt)} · {item.passengers}{" "}
                        passenger{item.passengers === 1 ? "" : "s"}
                      </p>
                    </div>
                    <strong>{money(item.fare)}</strong>
                  </div>
                  <div className="history-route">
                    {item.pickup?.label || "Pickup"}
                    <ArrowRight size={13} />
                    {item.dropoff?.label || "Destination"}
                  </div>
                  <div className="history-item-bottom">
                    <StatusPill status={item.status} />
                    {item.rating ? (
                      <span className="history-rating">
                        <Star size={14} fill="currentColor" />
                        {typeof item.rating === "object"
                          ? item.rating.score ||
                            item.rating.value ||
                            item.rating.rating
                          : item.rating}
                        /5
                      </span>
                    ) : !isDriver && item.status === "completed" ? (
                      <button
                        className="text-button"
                        onClick={() => setRatingRide(item)}
                      >
                        Rate your ride <Star size={14} />
                      </button>
                    ) : null}
                    {item.driver && (
                      <span>
                        {isDriver ? item.passenger?.name : item.driver.name}
                      </span>
                    )}
                  </div>
                  {item.cancelReason && (
                    <p className="hint">Cancellation: {item.cancelReason}</p>
                  )}
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <div className="empty-icon">
                <Route size={32} />
              </div>
              <h3>Your story starts with a ride.</h3>
              <p>Requested, completed and cancelled rides will appear here.</p>
              <button className="btn btn-primary" onClick={closeDrawer}>
                Find your next ride
                <ArrowRight size={17} />
              </button>
            </div>
          )}
        </Modal>
      )}

      {drawer === "safety" && (
        <Modal
          title="A little peace of mind."
          subtitle="Your safety belongs at the centre of every ride."
          onClose={closeDrawer}
        >
          <div className="safety-hero">
            <ShieldCheck size={36} />
            <div>
              <h3>Know your driver.</h3>
              <p>
                Match the face, vehicle and number plate in the app before
                getting in. A verified label means a person has reviewed the
                driver's submitted portrait and documents; it is not biometric
                or government verification.
              </p>
            </div>
          </div>
          {active && (
            <button className="btn btn-primary" onClick={shareRide}>
              <Share2 size={18} />
              Share this trip's details
            </button>
          )}
          <div className="safety-list">
            <article>
              <span>01</span>
              <div>
                <h3>Keep someone in the loop</h3>
                <p>
                  Share your trip summary with a trusted contact. It includes
                  your driver and plate when assigned, and a snapshot of the
                  latest location. It is not a live public tracking link.
                </p>
              </div>
            </article>
            <article>
              <span>02</span>
              <div>
                <h3>Your location stays purposeful</h3>
                <p>
                  Exact trip locations and messages are available to the
                  passenger, assigned driver and authorised administrators.
                  Drivers share an approximate public location while online.
                </p>
              </div>
            </article>
            <article>
              <span>03</span>
              <div>
                <h3>Travel with care</h3>
                <p>
                  Wear your seat belt. Do not overload the vehicle. Use in-app
                  chat or a phone call to clarify pickup, and keep your cash
                  fare ready.
                </p>
              </div>
            </article>
          </div>
          <div className="emergency-card">
            <div>
              <span>
                <Phone size={23} />
              </span>
              <div>
                <h3>In an emergency</h3>
                <p>
                  Move to a safe place and contact emergency services. This app
                  does not dispatch emergency help.
                </p>
              </div>
            </div>
            <a className="btn btn-danger" href="tel:10111">
              <Phone size={17} />
              Police · 10111
            </a>
            <a className="btn btn-secondary" href="tel:112">
              Mobile emergency · 112 <ArrowUpRight size={15} />
            </a>
          </div>
        </Modal>
      )}

      {drawer === "account" && profile && (
        <Modal
          title="Your corner of Keimoes."
          subtitle="A few details that help your journey go smoothly."
          onClose={closeDrawer}
        >
          <div className="account-heading">
            <span className="avatar avatar-large">
              {initials(profile.name)}
            </span>
            <div>
              <h3>{profile.name}</h3>
              <span className="chip">
                <Icon icon={isDriver ? CarFront : Users} size={13} />
                {isDriver ? "Driver account" : "Passenger account"}
              </span>
            </div>
          </div>
          <form onSubmit={saveAccount} className="stack">
            <label className="field">
              Full name
              <input
                autoComplete="name"
                minLength={2}
                maxLength={80}
                required
                value={accountName}
                onChange={(event) => setAccountName(event.target.value)}
              />
            </label>
            <label className="field">
              Mobile number
              <input
                type="tel"
                autoComplete="tel"
                required
                value={accountPhone}
                onChange={(event) => setAccountPhone(event.target.value)}
                placeholder="082 123 4567"
              />
            </label>
            <div className="account-email">
              <div>
                <small>Email address</small>
                <strong>{session.user.email}</strong>
              </div>
              <span
                className={`chip ${session.user.emailVerified ? "chip-success" : ""}`}
              >
                {session.user.emailVerified ? (
                  <Check size={13} />
                ) : (
                  <Info size={13} />
                )}
                {session.user.emailVerified ? "Verified" : "Unverified"}
              </span>
            </div>
            <button
              className="btn btn-primary"
              disabled={!runtime.canUseSensitiveFeatures || busy === "profile"}
            >
              {busy === "profile" ? (
                <LoaderCircle size={17} className="spin" />
              ) : (
                <Check size={17} />
              )}
              Save changes
            </button>
          </form>
          <div className="account-actions">
            <button
              onClick={() => {
                closeDrawer();
                openAuth();
              }}
            >
              <Shield size={19} />
              <span>Manage sign-in & verification</span>
              <ChevronRight size={17} />
            </button>
            <button
              onClick={async () => {
                try {
                  const result = await session.logout();
                  closeDrawer();
                  if (result?.warning) notify(result.warning, "info");
                  else success("You have signed out. See you around Keimoes.");
                } catch (error) {
                  notify(error.message);
                }
              }}
            >
              <LogOut size={19} />
              <span>Sign out</span>
              <ChevronRight size={17} />
            </button>
          </div>
          <p className="hint">
            Your account type is fixed for secure ride assignment. Driver
            documents are private and are reviewed by an authorised
            administrator.
          </p>
        </Modal>
      )}

      {drawer === "admin" && session.isAdmin && (
        <Modal
          title="Driver review desk"
          subtitle="Review private documents carefully before approving access to passenger requests."
          onClose={closeDrawer}
          wide
        >
          <AdminPanel session={session} onError={notify} onSuccess={success} />
        </Modal>
      )}

      {drawer === "about" && (
        <Modal
          title="Local rides, clearly priced."
          subtitle="Cash payments. Familiar places. Room for everyone."
          onClose={closeDrawer}
        >
          <div className="fare-explainer">
            <div>
              <span>
                <Home size={19} />
                Keimoes Central
              </span>
              <strong>
                {money(serviceConfig.fares.central)}
                <small>/ person</small>
              </strong>
            </div>
            <div>
              <span>
                <Sun size={19} />
                Upper Town
              </span>
              <strong>
                {money(serviceConfig.fares.upper)}
                <small>/ person</small>
              </strong>
            </div>
            <div>
              <span>
                <Sparkles size={19} />
                Private Express
              </span>
              <strong>
                {money(serviceConfig.fares.express)}
                <small>/ trip</small>
              </strong>
            </div>
          </div>
          <p className="body-copy">
            Shared rides are priced per passenger. Express is a private trip for
            up to four passengers. Custom shared destinations use a distance
            estimate at {money(serviceConfig.fares.customPerKm)} per kilometre,
            rounded up to the next R5, with a{" "}
            {money(serviceConfig.fares.customMinimum)} minimum per passenger.
            Your confirmed fare appears when the request is created.
          </p>
          <div className="notice">
            <Wallet size={20} />
            <p>
              Pay the displayed fare directly to your driver in cash. There are
              no card payments in this app.
            </p>
          </div>
          <h3 className="subheading">From request to arrival</h3>
          <div className="safety-list">
            <article>
              <span>01</span>
              <div>
                <h3>Drop your pins</h3>
                <p>
                  Choose your exact pickup and destination within{" "}
                  {serviceConfig.serviceRadiusKm} km of Keimoes, your ride type
                  and passenger count.
                </p>
              </div>
            </article>
            <article>
              <span>02</span>
              <div>
                <h3>Connect with a driver</h3>
                <p>
                  A verified, available driver can accept your request.
                  Unaccepted requests expire after ten minutes; availability is
                  never guaranteed.
                </p>
              </div>
            </article>
            <article>
              <span>03</span>
              <div>
                <h3>Make yourself at home</h3>
                <p>
                  Check your driver's face and plate, follow the live trip, and
                  pay in cash when you arrive.
                </p>
              </div>
            </article>
          </div>
          {!session.user && (
            <button
              className="btn btn-primary"
              onClick={() => {
                closeDrawer();
                openAuth("register", "driver");
              }}
            >
              Become a Keimoes driver
              <ArrowUpRight size={17} />
            </button>
          )}
        </Modal>
      )}

      {cancelOpen && ride && (
        <Modal
          title={
            ride.status === "in_progress"
              ? "Emergency trip cancellation"
              : "Cancel this ride?"
          }
          subtitle="Let the other person know why your plans changed."
          onClose={() => setCancelOpen(false)}
        >
          <div className="stack">
            <TripRoute ride={ride} compact />
            <label className="field">
              Reason for cancellation
              <textarea
                autoFocus
                minLength={3}
                maxLength={300}
                required
                rows={3}
                value={cancelReason}
                onChange={(event) => setCancelReason(event.target.value)}
                placeholder={
                  ride.status === "in_progress"
                    ? "Describe why you need to stop the trip…"
                    : "For example, my plans have changed…"
                }
              />
            </label>
            <div className="button-row">
              <button
                className="btn btn-secondary"
                onClick={() => setCancelOpen(false)}
              >
                Keep ride
              </button>
              <button
                className="btn btn-danger"
                disabled={Boolean(busy) || cancelReason.trim().length < 3}
                onClick={() => transition("cancel")}
              >
                {busy === "cancel" && (
                  <LoaderCircle size={17} className="spin" />
                )}
                Cancel ride
              </button>
            </div>
          </div>
        </Modal>
      )}

      {completeOpen && ride && (
        <Modal
          title="A good journey, complete."
          subtitle="Make sure your passenger has reached their destination safely."
          onClose={() => setCompleteOpen(false)}
        >
          <div className="stack">
            <div className="completion-fare">
              <span>Cash fare to collect</span>
              <strong>{money(ride.fare)}</strong>
            </div>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={completeConfirmed}
                onChange={(event) => setCompleteConfirmed(event.target.checked)}
              />
              <span>
                The destination has been reached and I have checked the cash
                payment with my passenger.
              </span>
            </label>
            <button
              className="btn btn-primary"
              disabled={!completeConfirmed || Boolean(busy)}
              onClick={() => transition("complete")}
            >
              {busy === "complete" ? (
                <LoaderCircle size={18} className="spin" />
              ) : (
                <CheckCheck size={18} />
              )}
              Confirm ride complete
            </button>
            <p className="hint">
              Completing a ride closes live tracking and chat for this trip.
            </p>
          </div>
        </Modal>
      )}

      {ratingRide && (
        <Modal
          title="How was the ride?"
          subtitle={`A little feedback goes a long way${ratingRide.driver?.name ? ` for ${ratingRide.driver.name}` : ""}.`}
          onClose={() => setRatingRide(null)}
        >
          <div className="rating-intro">
            <span className="rating-sun">
              <Sun size={29} />
            </span>
            <h3>Thanks for riding local.</h3>
            <p>
              {ratingRide.pickup?.label} <ArrowRight size={13} />{" "}
              {ratingRide.dropoff?.label}
            </p>
          </div>
          <RatingForm
            ride={ratingRide}
            onError={notify}
            onDone={() => {
              setRatingRide(null);
              success("Thank you. Your ride rating has been saved.");
            }}
          />
        </Modal>
      )}

      <div
        className="toast-region"
        aria-live="polite"
        aria-relevant="additions"
      >
        {toasts.map((toast) => (
          <div className={`toast toast-${toast.type}`} key={toast.id}>
            <span>
              {toast.type === "success" ? (
                <CheckCheck size={20} />
              ) : toast.type === "info" ? (
                <Info size={20} />
              ) : (
                <CircleHelp size={20} />
              )}
            </span>
            <p>{toast.message}</p>
            <button
              className="icon-button"
              onClick={() =>
                setToasts((items) =>
                  items.filter((item) => item.id !== toast.id),
                )
              }
              aria-label="Dismiss notification"
            >
              <X size={16} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
