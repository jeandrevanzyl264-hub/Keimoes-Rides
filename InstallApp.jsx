import { useEffect, useId, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpRight,
  Check,
  EllipsisVertical,
  ExternalLink,
  Info,
  LoaderCircle,
  Monitor,
  Plus,
  Share,
  ShieldCheck,
  Smartphone,
  X,
} from "lucide-react";

function browserDetails() {
  const agent = navigator.userAgent;
  const ios =
    /iPad|iPhone|iPod/.test(agent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return {
    ios,
    android: /Android/i.test(agent),
    embedded:
      /FBAN|FBAV|Instagram|Line\/|LinkedInApp|Snapchat|\bwv\b|GSA\//i.test(
        agent,
      ),
    standalone:
      window.matchMedia("(display-mode: standalone)").matches ||
      navigator.standalone === true,
  };
}

export default function InstallApp({ onNotice, publicUrl = "" }) {
  const details = useRef(browserDetails());
  const deferredPrompt = useRef(null);
  const dialogRef = useRef(null);
  const buttonRef = useRef(null);
  const [promptAvailable, setPromptAvailable] = useState(false);
  const [installed, setInstalled] = useState(details.current.standalone);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const titleId = useId();
  const secure = window.isSecureContext;
  let securePublicUrl;
  try {
    const candidate = new URL(publicUrl);
    if (candidate.protocol === "https:") securePublicUrl = candidate.href;
  } catch {
    /* A production URL is optional. */
  }

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)");
    const capturePrompt = (event) => {
      event.preventDefault();
      deferredPrompt.current = event;
      setPromptAvailable(true);
    };
    const onInstalled = () => {
      deferredPrompt.current = null;
      setPromptAvailable(false);
      setInstalled(true);
      setMessage(
        "Keimoes Rides is installed. Look for its icon on your home screen or in your apps.",
      );
      onNotice?.("Keimoes Rides is installed. Your next ride is a tap away.");
    };
    const displayChanged = () => {
      if (standalone.matches || navigator.standalone === true)
        setInstalled(true);
    };
    window.addEventListener("beforeinstallprompt", capturePrompt);
    window.addEventListener("appinstalled", onInstalled);
    standalone.addEventListener?.("change", displayChanged);
    return () => {
      window.removeEventListener("beforeinstallprompt", capturePrompt);
      window.removeEventListener("appinstalled", onInstalled);
      standalone.removeEventListener?.("change", displayChanged);
    };
  }, [onNotice]);

  useEffect(() => {
    if (open && dialogRef.current && !dialogRef.current.open)
      dialogRef.current.showModal();
    if (!open && dialogRef.current?.open) dialogRef.current.close();
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  function close() {
    setOpen(false);
    buttonRef.current?.focus();
  }

  async function install() {
    const prompt = deferredPrompt.current;
    if (!prompt || !secure || busy) return;
    setBusy(true);
    setMessage("");
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      setMessage(
        choice.outcome === "accepted"
          ? "Installation accepted. Finish any remaining step shown by your browser."
          : "You can install later from this menu. You can also keep using the website.",
      );
    } catch {
      setMessage(
        "The browser could not open its install prompt. Use the browser menu steps below.",
      );
    } finally {
      deferredPrompt.current = null;
      setPromptAvailable(false);
      setBusy(false);
    }
  }

  return (
    <>
      <button
        ref={buttonRef}
        className={`install-trigger ${installed ? "install-trigger-installed" : ""}`}
        onClick={() => setOpen(true)}
        aria-label={
          installed
            ? "Keimoes Rides app installation options"
            : "Install Keimoes Rides app"
        }
        aria-haspopup="dialog"
        aria-expanded={open}
        title={installed ? "App installed" : "Install Keimoes Rides"}
      >
        {installed ? <Check size={17} /> : <ArrowDownToLine size={17} />}
        <span>{installed ? "App installed" : "Install app"}</span>
      </button>
      <dialog
        ref={dialogRef}
        className="install-dialog modal"
        aria-labelledby={titleId}
        onCancel={(event) => {
          event.preventDefault();
          close();
        }}
        onClose={() => setOpen(false)}
        onClick={(event) => {
          if (event.target === dialogRef.current) {
            const rect = dialogRef.current.getBoundingClientRect();
            if (
              event.clientX < rect.left ||
              event.clientX > rect.right ||
              event.clientY < rect.top ||
              event.clientY > rect.bottom
            )
              close();
          }
        }}
      >
        <div className="modal-header">
          <span className="eyebrow">
            <Smartphone size={17} /> YOUR TOWN, IN YOUR POCKET
          </span>
          <button
            className="icon-button"
            onClick={close}
            aria-label="Close app installation"
          >
            <X size={20} />
          </button>
        </div>
        <div className="modal-body install-body">
          <div className="install-intro">
            <span className="install-app-icon">
              <img src="/icons/icon-192.png" alt="" width="64" height="64" />
            </span>
            <div>
              <h2 id={titleId}>
                {installed ? "You are all set." : "Keep Keimoes close."}
              </h2>
              <p>
                {installed
                  ? "Keimoes Rides is installed on this device."
                  : "Add Keimoes Rides to your home screen and open your local ride space in a tap."}
              </p>
            </div>
          </div>
          {message && (
            <p
              className={`notice ${installed ? "notice-success" : "notice-info"}`}
              role="status"
            >
              <Info size={18} />
              {message}
            </p>
          )}
          {!secure && (
            <div className="notice notice-warning install-security">
              <ShieldCheck size={21} />
              <div>
                <strong>Open the secure website first</strong>
                <p>
                  This page uses an insecure connection. Installation, live
                  location and camera features need HTTPS on your phone. A
                  computer’s private network address is for local development.
                </p>
                {securePublicUrl ? (
                  <a className="btn btn-primary" href={securePublicUrl}>
                    Open secure Keimoes Rides <ArrowUpRight size={16} />
                  </a>
                ) : (
                  <p>
                    Use the published HTTPS Keimoes Rides address, then return
                    to this menu.
                  </p>
                )}
              </div>
            </div>
          )}
          {details.current.embedded && !installed && (
            <div className="notice install-browser-notice">
              <ExternalLink size={19} />
              <div>
                <strong>Open in your regular browser</strong>
                <p>
                  This page opened inside another app. Use its{" "}
                  <EllipsisVertical size={14} /> menu and choose “Open in
                  Chrome”, “Open in Safari” or “Open in browser”, then open this
                  install menu again.
                </p>
              </div>
            </div>
          )}
          {installed ? (
            <div className="install-complete">
              <ShieldCheck size={30} />
              <h3>Your ride space is ready.</h3>
              <p>
                Open the Keimoes Rides icon to book or drive. An internet
                connection is needed for sign-in, ride requests, chat and live
                locations.
              </p>
              <button className="btn btn-primary" onClick={close}>
                Back to Keimoes <Check size={17} />
              </button>
            </div>
          ) : (
            <>
              {secure && promptAvailable && (
                <button
                  className="btn btn-primary install-native-button"
                  onClick={install}
                  disabled={busy}
                >
                  {busy ? (
                    <LoaderCircle size={19} className="spin" />
                  ) : (
                    <ArrowDownToLine size={19} />
                  )}
                  {busy
                    ? "Opening your browser’s installer…"
                    : "Install Keimoes Rides"}
                </button>
              )}
              <section
                className="install-instructions"
                aria-label="Manual app installation steps"
              >
                <div className="install-instructions-heading">
                  {details.current.ios ? (
                    <Share size={18} />
                  ) : details.current.android ? (
                    <Smartphone size={18} />
                  ) : (
                    <Monitor size={18} />
                  )}
                  <h3>
                    {details.current.ios
                      ? "On your iPhone or iPad"
                      : details.current.android
                        ? "On your Android phone"
                        : "On this computer"}
                  </h3>
                </div>
                <ol>
                  {details.current.ios ? (
                    <>
                      <li>
                        <span>1</span>
                        <p>
                          Open this website in <strong>Safari</strong>.
                        </p>
                      </li>
                      <li>
                        <span>2</span>
                        <p>
                          Tap <Share size={16} /> <strong>Share</strong> in
                          Safari’s toolbar. Scroll through the actions if
                          needed.
                        </p>
                      </li>
                      <li>
                        <span>3</span>
                        <p>
                          Choose <Plus size={16} />{" "}
                          <strong>Add to Home Screen</strong>, keep “Open as Web
                          App” on if shown, then tap <strong>Add</strong>.
                        </p>
                      </li>
                    </>
                  ) : details.current.android ? (
                    <>
                      <li>
                        <span>1</span>
                        <p>
                          Open the secure website in <strong>Chrome</strong>.
                        </p>
                      </li>
                      <li>
                        <span>2</span>
                        <p>
                          Tap the browser’s <EllipsisVertical size={16} /> menu,
                          then <strong>Install app</strong> or{" "}
                          <strong>Add to Home screen</strong>.
                        </p>
                      </li>
                      <li>
                        <span>3</span>
                        <p>
                          Confirm <strong>Install</strong> or{" "}
                          <strong>Add</strong>. Open Keimoes Rides from its new
                          app icon.
                        </p>
                      </li>
                    </>
                  ) : (
                    <>
                      <li>
                        <span>1</span>
                        <p>
                          Open this website in{" "}
                          <strong>Chrome or Microsoft Edge</strong>.
                        </p>
                      </li>
                      <li>
                        <span>2</span>
                        <p>
                          Use the <ArrowDownToLine size={16} /> install icon in
                          the address bar, or open the browser menu and look for{" "}
                          <strong>Install Keimoes Rides</strong> under apps.
                        </p>
                      </li>
                      <li>
                        <span>3</span>
                        <p>
                          Confirm the browser’s install dialog. Keimoes Rides
                          opens in its own app window.
                        </p>
                      </li>
                    </>
                  )}
                </ol>
              </section>
              <p className="install-footnote">
                {!promptAvailable && secure
                  ? "If an install option is missing, the browser may not support it, the app may already be installed, or the browser may need another visit. You can continue using all available features on the website."
                  : "Home screen installation uses your browser. Ride requests and live updates still need an internet connection."}
              </p>
            </>
          )}
        </div>
      </dialog>
    </>
  );
}
