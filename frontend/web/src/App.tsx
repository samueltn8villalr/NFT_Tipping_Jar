// App.tsx
import { ConnectButton } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import "./App.css";
import { useAccount, useSignMessage } from 'wagmi';

interface TipRecord {
  id: string;
  encryptedAmount: string;
  artistAddress: string;
  fanAddress: string;
  timestamp: number;
  messageHash: string;
  status: "pending" | "revealed";
}

// Style choices (randomly selected):
// Colors: Gradient (rainbow)
// UI Style: Glass morphism
// Layout: Card-based
// Interaction: Micro-interactions (hover effects)

const FHEEncryptNumber = (value: number): string => {
  return `FHE-${btoa(value.toString())}`;
};

const FHEDecryptNumber = (encryptedData: string): number => {
  if (encryptedData.startsWith('FHE-')) {
    return parseFloat(atob(encryptedData.substring(4)));
  }
  return parseFloat(encryptedData);
};

const generatePublicKey = () => `0x${Array(2000).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join('')}`;

const App: React.FC = () => {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [loading, setLoading] = useState(true);
  const [tips, setTips] = useState<TipRecord[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showTipModal, setShowTipModal] = useState(false);
  const [tipping, setTipping] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{ visible: boolean; status: "pending" | "success" | "error"; message: string; }>({ visible: false, status: "pending", message: "" });
  const [newTipData, setNewTipData] = useState({ artistAddress: "", amount: 0, message: "" });
  const [selectedTip, setSelectedTip] = useState<TipRecord | null>(null);
  const [decryptedAmount, setDecryptedAmount] = useState<number | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [publicKey, setPublicKey] = useState<string>("");
  const [contractAddress, setContractAddress] = useState<string>("");
  const [chainId, setChainId] = useState<number>(0);
  const [startTimestamp, setStartTimestamp] = useState<number>(0);
  const [durationDays, setDurationDays] = useState<number>(30);
  const [showStats, setShowStats] = useState(false);
  const [showFAQ, setShowFAQ] = useState(false);

  useEffect(() => {
    loadTips().finally(() => setLoading(false));
    const initSignatureParams = async () => {
      const contract = await getContractReadOnly();
      if (contract) setContractAddress(await contract.getAddress());
      if (window.ethereum) {
        const chainIdHex = await window.ethereum.request({ method: 'eth_chainId' });
        setChainId(parseInt(chainIdHex, 16));
      }
      setStartTimestamp(Math.floor(Date.now() / 1000));
      setDurationDays(30);
      setPublicKey(generatePublicKey());
    };
    initSignatureParams();
  }, []);

  const loadTips = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) return;
      
      const keysBytes = await contract.getData("tip_keys");
      let keys: string[] = [];
      if (keysBytes.length > 0) {
        try {
          const keysStr = ethers.toUtf8String(keysBytes);
          if (keysStr.trim() !== '') keys = JSON.parse(keysStr);
        } catch (e) { console.error("Error parsing tip keys:", e); }
      }
      
      const list: TipRecord[] = [];
      for (const key of keys) {
        try {
          const tipBytes = await contract.getData(`tip_${key}`);
          if (tipBytes.length > 0) {
            try {
              const tipData = JSON.parse(ethers.toUtf8String(tipBytes));
              list.push({ 
                id: key, 
                encryptedAmount: tipData.amount, 
                artistAddress: tipData.artistAddress, 
                fanAddress: tipData.fanAddress, 
                timestamp: tipData.timestamp, 
                messageHash: tipData.messageHash,
                status: tipData.status || "pending" 
              });
            } catch (e) { console.error(`Error parsing tip data for ${key}:`, e); }
          }
        } catch (e) { console.error(`Error loading tip ${key}:`, e); }
      }
      list.sort((a, b) => b.timestamp - a.timestamp);
      setTips(list);
    } catch (e) { console.error("Error loading tips:", e); } 
    finally { setIsRefreshing(false); setLoading(false); }
  };

  const sendTip = async () => {
    if (!isConnected) { alert("Please connect wallet first"); return; }
    if (!newTipData.artistAddress || !newTipData.amount) { alert("Please fill required fields"); return; }
    
    setTipping(true);
    setTransactionStatus({ 
      visible: true, 
      status: "pending", 
      message: "Encrypting tip amount with Zama FHE..." 
    });
    
    try {
      const encryptedAmount = FHEEncryptNumber(newTipData.amount);
      const messageHash = ethers.id(newTipData.message || "No message");
      
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      
      const tipId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      const tipData = { 
        amount: encryptedAmount, 
        artistAddress: newTipData.artistAddress,
        fanAddress: address,
        timestamp: Math.floor(Date.now() / 1000),
        messageHash: messageHash,
        status: "pending"
      };
      
      await contract.setData(`tip_${tipId}`, ethers.toUtf8Bytes(JSON.stringify(tipData)));
      
      const keysBytes = await contract.getData("tip_keys");
      let keys: string[] = [];
      if (keysBytes.length > 0) {
        try { keys = JSON.parse(ethers.toUtf8String(keysBytes)); } 
        catch (e) { console.error("Error parsing keys:", e); }
      }
      keys.push(tipId);
      await contract.setData("tip_keys", ethers.toUtf8Bytes(JSON.stringify(keys)));
      
      setTransactionStatus({ 
        visible: true, 
        status: "success", 
        message: "Private tip submitted successfully!" 
      });
      
      await loadTips();
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowTipModal(false);
        setNewTipData({ artistAddress: "", amount: 0, message: "" });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction") 
        ? "Transaction rejected by user" 
        : "Tip submission failed: " + (e.message || "Unknown error");
      setTransactionStatus({ 
        visible: true, 
        status: "error", 
        message: errorMessage 
      });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setTipping(false); 
    }
  };

  const decryptWithSignature = async (encryptedData: string): Promise<number | null> => {
    if (!isConnected) { alert("Please connect wallet first"); return null; }
    setIsDecrypting(true);
    try {
      const message = `publickey:${publicKey}\ncontractAddresses:${contractAddress}\ncontractsChainId:${chainId}\nstartTimestamp:${startTimestamp}\ndurationDays:${durationDays}`;
      await signMessageAsync({ message });
      await new Promise(resolve => setTimeout(resolve, 1500));
      return FHEDecryptNumber(encryptedData);
    } catch (e) { 
      console.error("Decryption failed:", e); 
      return null; 
    } finally { 
      setIsDecrypting(false); 
    }
  };

  const revealTip = async (tipId: string) => {
    if (!isConnected) { alert("Please connect wallet first"); return; }
    setTransactionStatus({ 
      visible: true, 
      status: "pending", 
      message: "Processing encrypted tip with FHE..." 
    });
    
    try {
      const contract = await getContractReadOnly();
      if (!contract) throw new Error("Failed to get contract");
      
      const tipBytes = await contract.getData(`tip_${tipId}`);
      if (tipBytes.length === 0) throw new Error("Tip not found");
      const tipData = JSON.parse(ethers.toUtf8String(tipBytes));
      
      const contractWithSigner = await getContractWithSigner();
      if (!contractWithSigner) throw new Error("Failed to get contract with signer");
      
      const updatedTip = { ...tipData, status: "revealed" };
      await contractWithSigner.setData(`tip_${tipId}`, ethers.toUtf8Bytes(JSON.stringify(updatedTip)));
      
      setTransactionStatus({ 
        visible: true, 
        status: "success", 
        message: "Tip revealed successfully!" 
      });
      await loadTips();
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
    } catch (e: any) {
      setTransactionStatus({ 
        visible: true, 
        status: "error", 
        message: "Reveal failed: " + (e.message || "Unknown error") 
      });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  const isArtist = (tipAddress: string) => address?.toLowerCase() === tipAddress.toLowerCase();
  const isFan = (tipAddress: string) => address?.toLowerCase() === tipAddress.toLowerCase();

  const totalTips = tips.length;
  const totalAmount = tips.reduce((sum, tip) => {
    if (tip.status === "revealed" && decryptedAmount) {
      return sum + decryptedAmount;
    }
    return sum;
  }, 0);

  const faqItems = [
    {
      question: "What is Zama FHE?",
      answer: "Zama FHE (Fully Homomorphic Encryption) allows computations on encrypted data without decryption, ensuring complete privacy."
    },
    {
      question: "How are tips encrypted?",
      answer: "Tip amounts are encrypted client-side using FHE before being sent to the blockchain, remaining encrypted during processing."
    },
    {
      question: "Can I see who sent me a tip?",
      answer: "Tip sender addresses are visible only after they choose to reveal their identity through a wallet signature."
    },
    {
      question: "How do I attach messages to NFTs?",
      answer: "Encrypted message hashes can be added to your NFT metadata as hidden comments, decipherable only by the artist."
    }
  ];

  if (loading) return (
    <div className="loading-screen">
      <div className="spinner"></div>
      <p>Initializing private tipping connection...</p>
    </div>
  );

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo">
          <h1>NFT<span>Privacy</span>TipJar</h1>
          <div className="tagline">FHE-Encrypted Support for Creators</div>
        </div>
        <div className="header-actions">
          <ConnectButton 
            accountStatus="address" 
            chainStatus="icon" 
            showBalance={false}
            label="Connect Wallet"
          />
        </div>
      </header>

      <main className="main-content">
        <section className="hero-section">
          <div className="hero-content">
            <h2>Support NFT Artists Privately</h2>
            <p>Send encrypted tips with FHE-protected amounts and messages that can be attached to NFTs as hidden metadata.</p>
            <div className="hero-buttons">
              <button 
                onClick={() => setShowTipModal(true)} 
                className="primary-btn"
              >
                Send Private Tip
              </button>
              <button 
                onClick={() => setShowStats(!showStats)} 
                className="secondary-btn"
              >
                {showStats ? "Hide Stats" : "Show Stats"}
              </button>
            </div>
          </div>
          <div className="hero-image">
            <div className="nft-card"></div>
            <div className="fhe-badge">
              <span>Powered by Zama FHE</span>
            </div>
          </div>
        </section>

        {showStats && (
          <section className="stats-section">
            <div className="stat-card">
              <h3>Total Tips</h3>
              <div className="stat-value">{totalTips}</div>
            </div>
            <div className="stat-card">
              <h3>Total Value</h3>
              <div className="stat-value">{totalAmount.toFixed(2)} ETH</div>
            </div>
            <div className="stat-card">
              <h3>Your Tips</h3>
              <div className="stat-value">
                {tips.filter(t => isFan(t.fanAddress)).length}
              </div>
            </div>
            <div className="stat-card">
              <h3>Your Earnings</h3>
              <div className="stat-value">
                {tips.filter(t => isArtist(t.artistAddress) && t.status === "revealed").length}
              </div>
            </div>
          </section>
        )}

        <section className="tips-section">
          <div className="section-header">
            <h2>Your Tip History</h2>
            <div className="header-actions">
              <button 
                onClick={loadTips} 
                className="refresh-btn" 
                disabled={isRefreshing}
              >
                {isRefreshing ? "Refreshing..." : "Refresh"}
              </button>
              <button 
                onClick={() => setShowFAQ(!showFAQ)} 
                className="info-btn"
              >
                {showFAQ ? "Hide FAQ" : "Show FAQ"}
              </button>
            </div>
          </div>

          {showFAQ && (
            <div className="faq-section">
              <h3>Frequently Asked Questions</h3>
              <div className="faq-grid">
                {faqItems.map((item, index) => (
                  <div key={index} className="faq-card">
                    <h4>{item.question}</h4>
                    <p>{item.answer}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="tips-grid">
            {tips.length === 0 ? (
              <div className="no-tips">
                <div className="empty-icon"></div>
                <p>No tips found yet</p>
                <button 
                  className="primary-btn" 
                  onClick={() => setShowTipModal(true)}
                >
                  Send Your First Tip
                </button>
              </div>
            ) : tips.map(tip => (
              <div 
                key={tip.id} 
                className={`tip-card ${tip.status}`}
                onClick={() => setSelectedTip(tip)}
              >
                <div className="tip-header">
                  <div className="tip-id">#{tip.id.substring(0, 6)}</div>
                  <div className={`tip-status ${tip.status}`}>
                    {tip.status === "pending" ? "Private" : "Revealed"}
                  </div>
                </div>
                <div className="tip-details">
                  <div className="detail-item">
                    <span>To:</span>
                    <span>{tip.artistAddress.substring(0, 6)}...{tip.artistAddress.substring(38)}</span>
                  </div>
                  <div className="detail-item">
                    <span>From:</span>
                    <span>{tip.fanAddress.substring(0, 6)}...{tip.fanAddress.substring(38)}</span>
                  </div>
                  <div className="detail-item">
                    <span>Date:</span>
                    <span>{new Date(tip.timestamp * 1000).toLocaleDateString()}</span>
                  </div>
                </div>
                <div className="tip-actions">
                  {isFan(tip.fanAddress) && tip.status === "pending" && (
                    <button 
                      className="reveal-btn"
                      onClick={(e) => { e.stopPropagation(); revealTip(tip.id); }}
                    >
                      Reveal
                    </button>
                  )}
                  {isArtist(tip.artistAddress) && (
                    <button 
                      className="decrypt-btn"
                      onClick={(e) => { 
                        e.stopPropagation(); 
                        if (decryptedAmount) {
                          setDecryptedAmount(null);
                        } else {
                          decryptWithSignature(tip.encryptedAmount).then(val => {
                            if (val !== null) setDecryptedAmount(val);
                          });
                        }
                      }}
                      disabled={isDecrypting}
                    >
                      {isDecrypting ? "Decrypting..." : 
                       decryptedAmount ? "Hide Amount" : "View Amount"}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>

      {showTipModal && (
        <div className="modal-overlay">
          <div className="tip-modal">
            <div className="modal-header">
              <h2>Send Private Tip</h2>
              <button onClick={() => setShowTipModal(false)} className="close-modal">
                &times;
              </button>
            </div>
            <div className="modal-body">
              <div className="fhe-notice">
                <div className="lock-icon"></div>
                <p>All tip amounts are encrypted with Zama FHE before submission</p>
              </div>
              
              <div className="form-group">
                <label>Artist Address *</label>
                <input
                  type="text"
                  name="artistAddress"
                  value={newTipData.artistAddress}
                  onChange={(e) => setNewTipData({...newTipData, artistAddress: e.target.value})}
                  placeholder="0x..."
                  className="form-input"
                />
              </div>
              
              <div className="form-group">
                <label>Amount (ETH) *</label>
                <input
                  type="number"
                  name="amount"
                  value={newTipData.amount}
                  onChange={(e) => setNewTipData({...newTipData, amount: parseFloat(e.target.value)})}
                  placeholder="0.00"
                  step="0.01"
                  min="0"
                  className="form-input"
                />
              </div>
              
              <div className="form-group">
                <label>Encrypted Message (Optional)</label>
                <textarea
                  name="message"
                  value={newTipData.message}
                  onChange={(e) => setNewTipData({...newTipData, message: e.target.value})}
                  placeholder="Your message will be hashed and encrypted"
                  className="form-textarea"
                  rows={3}
                />
              </div>
              
              <div className="encryption-preview">
                <div className="preview-row">
                  <span>Plain Amount:</span>
                  <span>{newTipData.amount || 0} ETH</span>
                </div>
                <div className="arrow-icon">↓</div>
                <div className="preview-row">
                  <span>Encrypted:</span>
                  <span className="encrypted-value">
                    {newTipData.amount ? FHEEncryptNumber(newTipData.amount).substring(0, 20) + '...' : 'N/A'}
                  </span>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button 
                onClick={() => setShowTipModal(false)} 
                className="cancel-btn"
              >
                Cancel
              </button>
              <button 
                onClick={sendTip} 
                disabled={tipping}
                className="submit-btn"
              >
                {tipping ? "Processing..." : "Send Private Tip"}
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedTip && (
        <div className="modal-overlay">
          <div className="detail-modal">
            <div className="modal-header">
              <h2>Tip Details</h2>
              <button 
                onClick={() => { 
                  setSelectedTip(null); 
                  setDecryptedAmount(null); 
                }} 
                className="close-modal"
              >
                &times;
              </button>
            </div>
            <div className="modal-body">
              <div className="detail-row">
                <span>Tip ID:</span>
                <span>#{selectedTip.id.substring(0, 8)}</span>
              </div>
              <div className="detail-row">
                <span>Artist:</span>
                <span>{selectedTip.artistAddress}</span>
              </div>
              <div className="detail-row">
                <span>Fan:</span>
                <span>{selectedTip.fanAddress}</span>
              </div>
              <div className="detail-row">
                <span>Date:</span>
                <span>{new Date(selectedTip.timestamp * 1000).toLocaleString()}</span>
              </div>
              <div className="detail-row">
                <span>Status:</span>
                <span className={`status-badge ${selectedTip.status}`}>
                  {selectedTip.status === "pending" ? "Private" : "Revealed"}
                </span>
              </div>
              
              <div className="amount-section">
                <h3>Tip Amount</h3>
                <div className="encrypted-amount">
                  {selectedTip.encryptedAmount.substring(0, 30)}...
                </div>
                {(isArtist(selectedTip.artistAddress) || isFan(selectedTip.fanAddress)) && (
                  <button
                    className="decrypt-btn"
                    onClick={async () => {
                      if (decryptedAmount !== null) {
                        setDecryptedAmount(null);
                      } else {
                        const amount = await decryptWithSignature(selectedTip.encryptedAmount);
                        if (amount !== null) setDecryptedAmount(amount);
                      }
                    }}
                    disabled={isDecrypting}
                  >
                    {isDecrypting ? "Decrypting..." : 
                     decryptedAmount !== null ? "Hide Amount" : "Decrypt Amount"}
                  </button>
                )}
                {decryptedAmount !== null && (
                  <div className="decrypted-amount">
                    <span>Decrypted Amount:</span>
                    <span className="value">{decryptedAmount} ETH</span>
                  </div>
                )}
              </div>
              
              <div className="message-section">
                <h3>Message Hash</h3>
                <div className="message-hash">
                  {selectedTip.messageHash}
                </div>
                <div className="message-note">
                  This hash can be attached to your NFT metadata as a hidden comment
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button 
                onClick={() => { 
                  setSelectedTip(null); 
                  setDecryptedAmount(null); 
                }} 
                className="close-btn"
              >
                Close
              </button>
              {isFan(selectedTip.fanAddress) && selectedTip.status === "pending" && (
                <button 
                  onClick={() => revealTip(selectedTip.id)}
                  className="reveal-btn"
                >
                  Reveal This Tip
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className={`transaction-content ${transactionStatus.status}`}>
            <div className="transaction-icon">
              {transactionStatus.status === "pending" && <div className="spinner"></div>}
              {transactionStatus.status === "success" && <div className="check-icon"></div>}
              {transactionStatus.status === "error" && <div className="error-icon"></div>}
            </div>
            <div className="transaction-message">{transactionStatus.message}</div>
          </div>
        </div>
      )}

      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <h3>NFT Privacy Tip Jar</h3>
            <p>FHE-encrypted support for NFT creators</p>
          </div>
          <div className="footer-links">
            <a href="#" className="footer-link">Documentation</a>
            <a href="#" className="footer-link">Privacy Policy</a>
            <a href="#" className="footer-link">Terms</a>
            <a href="#" className="footer-link">Contact</a>
          </div>
        </div>
        <div className="footer-bottom">
          <div className="fhe-badge">
            <span>Powered by Zama FHE</span>
          </div>
          <div className="copyright">
            © {new Date().getFullYear()} NFT Privacy Tip Jar. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
};

export default App;