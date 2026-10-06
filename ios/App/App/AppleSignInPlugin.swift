import Foundation
import Capacitor
import AuthenticationServices
import CryptoKit

// Plugin local « QuatuorApple » : fenêtre native « Se connecter avec Apple ».
// Renvoie le jeton d'identité (idToken) que le jeu transmet à Supabase avec le nonce d'origine
// (Apple ne reçoit que son empreinte SHA-256, comme l'exige Supabase).
// Appelé depuis le jeu par Capacitor.nativePromise("QuatuorApple", "connexion", { nonce }).
@objc(QuatuorApplePlugin)
public class QuatuorApplePlugin: CAPPlugin, CAPBridgedPlugin, ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
    public let identifier = "QuatuorApplePlugin"
    public let jsName = "QuatuorApple"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "connexion", returnType: CAPPluginReturnPromise)
    ]

    private var appelEnCours: CAPPluginCall?

    @objc func connexion(_ call: CAPPluginCall) {
        guard let nonce = call.getString("nonce"), !nonce.isEmpty else {
            call.reject("Nonce manquant", "NONCE")
            return
        }
        DispatchQueue.main.async {
            if self.appelEnCours != nil {
                call.reject("Connexion déjà en cours", "EN_COURS")
                return
            }
            self.appelEnCours = call
            let demande = ASAuthorizationAppleIDProvider().createRequest()
            demande.requestedScopes = [.email]
            demande.nonce = QuatuorApplePlugin.sha256(nonce)
            let controleur = ASAuthorizationController(authorizationRequests: [demande])
            controleur.delegate = self
            controleur.presentationContextProvider = self
            controleur.performRequests()
        }
    }

    static func sha256(_ texte: String) -> String {
        return SHA256.hash(data: Data(texte.utf8)).map { String(format: "%02x", $0) }.joined()
    }

    public func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        return bridge?.webView?.window ?? ASPresentationAnchor()
    }

    public func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
        guard let call = appelEnCours else { return }
        appelEnCours = nil
        guard let identifiant = authorization.credential as? ASAuthorizationAppleIDCredential,
              let donnees = identifiant.identityToken,
              let jeton = String(data: donnees, encoding: .utf8) else {
            call.reject("Jeton Apple manquant", "SANS_JETON")
            return
        }
        call.resolve(["idToken": jeton])
    }

    public func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        guard let call = appelEnCours else { return }
        appelEnCours = nil
        if let erreur = error as? ASAuthorizationError, erreur.code == .canceled {
            call.reject("Connexion annulée", "ANNULE")
            return
        }
        call.reject(error.localizedDescription, "ERREUR", error)
    }
}
