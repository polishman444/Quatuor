import UIKit
import Capacitor

// Contrôleur principal : celui de Capacitor, plus nos plugins locaux (connexion Apple).
class MainViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(QuatuorApplePlugin())
    }
}
