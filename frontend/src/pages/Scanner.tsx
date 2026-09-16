import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Html5Qrcode } from 'html5-qrcode';

import { api } from '../lib/api';
import { apiErrorMessage } from '../lib/types';

type VerificationResult = {
  result: string;
  ticketId?: string;
  usedAt?: string | null;
};

export function Scanner() {
  const [credential, setCredential] = useState('');
  const [result, setResult] =
    useState<VerificationResult>();

  const [cameraActive, setCameraActive] =
    useState(false);

  const [startingCamera, setStartingCamera] =
    useState(false);

  const [busy, setBusy] = useState(false);

  const scannerRef =
    useRef<Html5Qrcode | null>(null);

  const verifyingRef =
    useRef(false);

  const mountedRef =
    useRef(true);

  /*
   * Stop and completely clean up the camera.
   *
   * IMPORTANT:
   * React never removes the scanner host itself.
   * Html5Qrcode owns the contents of that host.
   */
  const stopCamera = useCallback(async () => {
    const scanner = scannerRef.current;

    if (!scanner) {
      if (mountedRef.current) {
        setCameraActive(false);
        setStartingCamera(false);
      }

      return;
    }

    scannerRef.current = null;

    try {
      await scanner.stop();
    } catch {
      // Camera may already be stopped.
    }

    try {
      scanner.clear();
    } catch {
      // The library may already have cleared its DOM.
    }

    if (mountedRef.current) {
      setCameraActive(false);
      setStartingCamera(false);
    }
  }, []);

  /*
   * Verify a credential through the backend.
   */
  const verify = useCallback(
    async (value: string) => {
      const trimmed = value.trim();

      if (!trimmed || verifyingRef.current) {
        return;
      }

      verifyingRef.current = true;

      if (mountedRef.current) {
        setBusy(true);
        setResult(undefined);
      }

      try {
        const response = await api.post(
          '/verification/ticket',
          {
            credential: trimmed,
          },
          {
            headers: {
              'Idempotency-Key':
                crypto.randomUUID(),
            },
          },
        );

        if (mountedRef.current) {
          setResult(
            response.data.data as VerificationResult,
          );
        }

        await stopCamera();
      } catch (error: unknown) {
        if (mountedRef.current) {
          setResult({
            result: apiErrorMessage(
              error,
              'Verification failed.',
            ),
          });
        }
      } finally {
        verifyingRef.current = false;

        if (mountedRef.current) {
          setBusy(false);
        }
      }
    },
    [stopCamera],
  );

  /*
   * Start the camera.
   */
  const startCamera = async () => {
    if (
      scannerRef.current ||
      startingCamera ||
      busy
    ) {
      return;
    }

    setResult(undefined);
    setStartingCamera(true);

    try {
      if (
        !navigator.mediaDevices ||
        !navigator.mediaDevices.getUserMedia
      ) {
        throw new Error(
          'Camera access is not supported by this browser.',
        );
      }

      /*
       * The scanner host is ALWAYS rendered.
       * Wait for React to finish rendering.
       */
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          resolve();
        });
      });

      if (!mountedRef.current) {
        return;
      }

      const container =
        document.getElementById(
          'ticketguard-scanner',
        );

      if (!container) {
        throw new Error(
          'Scanner container could not be initialized.',
        );
      }

      /*
       * Make absolutely sure the host starts empty.
       */
      container.replaceChildren();

      const scanner =
        new Html5Qrcode(
          'ticketguard-scanner',
        );

      scannerRef.current = scanner;

      const cameras =
        await Html5Qrcode.getCameras();

      if (!cameras.length) {
        throw new Error(
          'No camera was detected on this device.',
        );
      }

      const preferredCamera =
        cameras.find((camera) =>
          /back|rear|environment/i.test(
            camera.label,
          ),
        ) || cameras[0];

      await scanner.start(
        preferredCamera.id,
        {
          fps: 10,
          qrbox: {
            width: 250,
            height: 250,
          },
          aspectRatio: 1,
        },
        (decodedText) => {
          if (verifyingRef.current) {
            return;
          }

          setCredential(decodedText);

          void verify(decodedText);
        },
        () => {
          /*
           * QR not detected in this frame.
           * This is normal and should not create an error.
           */
        },
      );

      if (mountedRef.current) {
        setCameraActive(true);
        setStartingCamera(false);
      }
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : 'Unable to access the camera.';

      await stopCamera();

      if (mountedRef.current) {
        setResult({
          result:
            `${errorMessage} You can paste the full credential below.`,
        });
      }
    }
  };

  /*
   * Cleanup when leaving the page.
   */
  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;

      const scanner =
        scannerRef.current;

      scannerRef.current = null;

      if (scanner) {
        void scanner
          .stop()
          .catch(() => undefined)
          .then(() => {
            try {
              scanner.clear();
            } catch {
              // Already cleared.
            }
          });
      }
    };
  }, []);

  const approved =
    result?.result === 'VALID';

  return (
    <div className="page">
      <div className="scanner-page">
        <div className="scanner-box">
          <span
            className="eyebrow"
            style={{ color: '#8d87ff' }}
          >
            Venue operations
          </span>

          <h1>Verify entry.</h1>

          <p
            style={{
              color: '#aeb7d5',
              maxWidth: 620,
            }}
          >
            Scan a TicketGuard QR code.
            Authorization, credential validity
            and ticket state are verified by
            the server.
          </p>

          {/* 
            CRITICAL:
            This div must remain permanently mounted
            and MUST NOT contain React children.
            Html5Qrcode owns its contents.
          */}
          <div
            id="ticketguard-scanner"
            className="scan-frame"
            style={{
              minHeight: 330,
              position: 'relative',
              overflow: 'hidden',
            }}
          />

          {/* UI OUTSIDE THE HTML5QRCODE HOST */}
          {!cameraActive &&
            !startingCamera && (
              <div
                style={{
                  textAlign: 'center',
                  padding: 24,
                }}
              >
                <div
                  style={{
                    fontSize: 42,
                    marginBottom: 8,
                  }}
                >
                  ◉
                </div>

                <strong>
                  Camera scanner ready
                </strong>

                <p className="muted">
                  Start the camera to scan a
                  TicketGuard QR code.
                </p>
              </div>
            )}

          {startingCamera && (
            <div
              style={{
                textAlign: 'center',
                padding: 20,
              }}
            >
              <strong>
                Starting camera…
              </strong>

              <p className="muted">
                Allow camera access if your
                browser asks.
              </p>
            </div>
          )}

          {/* CAMERA BUTTONS */}
          <div className="actions">
            {!cameraActive ? (
              <button
                type="button"
                className="btn accent"
                onClick={() =>
                  void startCamera()
                }
                disabled={
                  startingCamera ||
                  busy
                }
              >
                {startingCamera
                  ? 'Starting camera…'
                  : 'Start camera'}
              </button>
            ) : (
              <button
                type="button"
                className="btn ghost"
                onClick={() =>
                  void stopCamera()
                }
                disabled={busy}
              >
                Stop camera
              </button>
            )}
          </div>

          {/* MANUAL VERIFICATION */}
          <div
            style={{
              marginTop: 28,
              paddingTop: 24,
              borderTop:
                '1px solid rgba(255,255,255,.12)',
            }}
          >
            <label
              htmlFor="manual-credential"
              style={{
                display: 'block',
                fontWeight: 700,
                marginBottom: 8,
              }}
            >
              Manual credential
            </label>

            <textarea
              id="manual-credential"
              className="input"
              rows={4}
              value={credential}
              onChange={(event) =>
                setCredential(
                  event.target.value,
                )
              }
              placeholder="Paste the full tg1.… credential"
              disabled={busy}
            />

            <button
              type="button"
              className="btn primary"
              style={{
                width: '100%',
                marginTop: 10,
              }}
              disabled={
                !credential.trim() ||
                busy
              }
              onClick={() =>
                void verify(credential)
              }
            >
              {busy
                ? 'Verifying…'
                : 'Verify ticket'}
            </button>
          </div>

          {/* RESULT */}
          {result && (
            <div
              className={`result ${
                approved
                  ? 'valid'
                  : 'invalid'
              }`}
              style={{
                marginTop: 24,
              }}
            >
              <div
                style={{
                  fontSize: 28,
                  fontWeight: 700,
                }}
              >
                {approved
                  ? '✓ ENTRY APPROVED'
                  : '× ENTRY DENIED'}
              </div>

              <p>
                {approved
                  ? 'Ticket verified successfully.'
                  : result.result}
              </p>

              {approved &&
                result.usedAt && (
                  <small>
                    Checked in:{' '}
                    {new Date(
                      result.usedAt,
                    ).toLocaleString()}
                  </small>
                )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}