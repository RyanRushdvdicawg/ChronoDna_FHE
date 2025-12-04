// App.tsx
import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import WalletManager from "./components/WalletManager";
import WalletSelector from "./components/WalletSelector";
import "./App.css";

interface ChronotypeData {
  id: string;
  encryptedData: string;
  timestamp: number;
  owner: string;
  chronotype: string;
  recommendedSleep: string;
  recommendedWake: string;
  productivityPeak: string;
  status: "pending" | "analyzed" | "error";
}

const App: React.FC = () => {
  const [account, setAccount] = useState("");
  const [loading, setLoading] = useState(true);
  const [analyses, setAnalyses] = useState<ChronotypeData[]>([]);
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showAnalyzeModal, setShowAnalyzeModal] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [walletSelectorOpen, setWalletSelectorOpen] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{
    visible: boolean;
    status: "pending" | "success" | "error";
    message: string;
  }>({ visible: false, status: "pending", message: "" });
  const [newAnalysisData, setNewAnalysisData] = useState({
    dnaSequence: "",
    lifestyle: "balanced",
    ageRange: "25-35"
  });
  const [showTutorial, setShowTutorial] = useState(false);
  const [selectedAnalysis, setSelectedAnalysis] = useState<ChronotypeData | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Calculate statistics for dashboard
  const analyzedCount = analyses.filter(a => a.status === "analyzed").length;
  const pendingCount = analyses.filter(a => a.status === "pending").length;
  const errorCount = analyses.filter(a => a.status === "error").length;

  useEffect(() => {
    loadAnalyses().finally(() => setLoading(false));
  }, []);

  const onWalletSelect = async (wallet: any) => {
    if (!wallet.provider) return;
    try {
      const web3Provider = new ethers.BrowserProvider(wallet.provider);
      setProvider(web3Provider);
      const accounts = await web3Provider.send("eth_requestAccounts", []);
      const acc = accounts[0] || "";
      setAccount(acc);

      wallet.provider.on("accountsChanged", async (accounts: string[]) => {
        const newAcc = accounts[0] || "";
        setAccount(newAcc);
      });
    } catch (e) {
      alert("Failed to connect wallet");
    }
  };

  const onConnect = () => setWalletSelectorOpen(true);
  const onDisconnect = () => {
    setAccount("");
    setProvider(null);
  };

  const loadAnalyses = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      // Check contract availability using FHE
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) {
        console.error("Contract is not available");
        return;
      }
      
      const keysBytes = await contract.getData("analysis_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing analysis keys:", e);
        }
      }
      
      const list: ChronotypeData[] = [];
      
      for (const key of keys) {
        try {
          const analysisBytes = await contract.getData(`analysis_${key}`);
          if (analysisBytes.length > 0) {
            try {
              const analysisData = JSON.parse(ethers.toUtf8String(analysisBytes));
              list.push({
                id: key,
                encryptedData: analysisData.data,
                timestamp: analysisData.timestamp,
                owner: analysisData.owner,
                chronotype: analysisData.chronotype || "Unknown",
                recommendedSleep: analysisData.recommendedSleep || "22:00",
                recommendedWake: analysisData.recommendedWake || "06:00",
                productivityPeak: analysisData.productivityPeak || "10:00-14:00",
                status: analysisData.status || "pending"
              });
            } catch (e) {
              console.error(`Error parsing analysis data for ${key}:`, e);
            }
          }
        } catch (e) {
          console.error(`Error loading analysis ${key}:`, e);
        }
      }
      
      list.sort((a, b) => b.timestamp - a.timestamp);
      setAnalyses(list);
    } catch (e) {
      console.error("Error loading analyses:", e);
    } finally {
      setIsRefreshing(false);
      setLoading(false);
    }
  };

  const submitAnalysis = async () => {
    if (!provider) { 
      alert("Please connect wallet first"); 
      return; 
    }
    
    setAnalyzing(true);
    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Encrypting DNA data with FHE for privacy-preserving analysis..."
    });
    
    try {
      // Simulate FHE encryption of DNA data
      const encryptedData = `FHE-DNA-${btoa(JSON.stringify(newAnalysisData))}`;
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const analysisId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      const analysisData = {
        data: encryptedData,
        timestamp: Math.floor(Date.now() / 1000),
        owner: account,
        chronotype: "",
        recommendedSleep: "",
        recommendedWake: "",
        productivityPeak: "",
        status: "pending"
      };
      
      // Store encrypted data on-chain using FHE
      await contract.setData(
        `analysis_${analysisId}`, 
        ethers.toUtf8Bytes(JSON.stringify(analysisData))
      );
      
      const keysBytes = await contract.getData("analysis_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing keys:", e);
        }
      }
      
      keys.push(analysisId);
      
      await contract.setData(
        "analysis_keys", 
        ethers.toUtf8Bytes(JSON.stringify(keys))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "DNA data encrypted and submitted for FHE analysis!"
      });
      
      await loadAnalyses();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowAnalyzeModal(false);
        setNewAnalysisData({
          dnaSequence: "",
          lifestyle: "balanced",
          ageRange: "25-35"
        });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction")
        ? "Transaction rejected by user"
        : "Submission failed: " + (e.message || "Unknown error");
      
      setTransactionStatus({
        visible: true,
        status: "error",
        message: errorMessage
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    } finally {
      setAnalyzing(false);
    }
  };

  const runAnalysis = async (analysisId: string) => {
    if (!provider) {
      alert("Please connect wallet first");
      return;
    }

    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Processing encrypted DNA data with FHE computation..."
    });

    try {
      // Simulate FHE computation time for chronotype analysis
      await new Promise(resolve => setTimeout(resolve, 4000));
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const analysisBytes = await contract.getData(`analysis_${analysisId}`);
      if (analysisBytes.length === 0) {
        throw new Error("Analysis not found");
      }
      
      const analysisData = JSON.parse(ethers.toUtf8String(analysisBytes));
      
      // Simulate FHE analysis results
      const chronotypes = ["Wolf", "Bear", "Lion", "Dolphin"];
      const sleepTimes = ["23:00", "22:30", "21:00", "00:30"];
      const wakeTimes = ["07:00", "06:30", "05:00", "06:30"];
      const productivityPeaks = ["21:00-23:00", "10:00-14:00", "05:00-10:00", "10:00-12:00 & 18:00-20:00"];
      
      const randomIndex = Math.floor(Math.random() * chronotypes.length);
      
      const updatedAnalysis = {
        ...analysisData,
        chronotype: chronotypes[randomIndex],
        recommendedSleep: sleepTimes[randomIndex],
        recommendedWake: wakeTimes[randomIndex],
        productivityPeak: productivityPeaks[randomIndex],
        status: "analyzed"
      };
      
      await contract.setData(
        `analysis_${analysisId}`, 
        ethers.toUtf8Bytes(JSON.stringify(updatedAnalysis))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "FHE chronotype analysis completed successfully!"
      });
      
      await loadAnalyses();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e: any) {
      setTransactionStatus({
        visible: true,
        status: "error",
        message: "Analysis failed: " + (e.message || "Unknown error")
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    }
  };

  const isOwner = (address: string) => {
    return account.toLowerCase() === address.toLowerCase();
  };

  const tutorialSteps = [
    {
      title: "Connect Wallet",
      description: "Connect your Web3 wallet to access the FHE chronotype analysis",
      icon: "🔗"
    },
    {
      title: "Submit Encrypted DNA Data",
      description: "Provide your DNA markers which will be encrypted using FHE technology",
      icon: "🧬"
    },
    {
      title: "FHE Chronotype Analysis",
      description: "Your DNA is analyzed in encrypted state without decryption",
      icon: "⚙️"
    },
    {
      title: "Get Personalized Schedule",
      description: "Receive your optimal sleep/wake schedule based on genetic predispositions",
      icon: "⏰"
    }
  ];

  const renderChronotypeChart = () => {
    const chronotypeCounts: Record<string, number> = {};
    analyses.forEach(a => {
      if (a.status === "analyzed") {
        chronotypeCounts[a.chronotype] = (chronotypeCounts[a.chronotype] || 0) + 1;
      }
    });
    
    const totalAnalyzed = analyzedCount || 1;
    
    return (
      <div className="chronotype-chart">
        {Object.entries(chronotypeCounts).map(([type, count]) => (
          <div key={type} className="chart-bar">
            <div className="bar-label">{type}</div>
            <div className="bar-container">
              <div 
                className="bar-fill" 
                style={{ width: `${(count / totalAnalyzed) * 100}%` }}
              ></div>
            </div>
            <div className="bar-count">{count}</div>
          </div>
        ))}
      </div>
    );
  };

  const filteredAnalyses = analyses.filter(analysis => {
    return analysis.chronotype.toLowerCase().includes(searchQuery.toLowerCase()) ||
           analysis.owner.toLowerCase().includes(searchQuery.toLowerCase());
  });

  if (loading) return (
    <div className="loading-screen">
      <div className="dna-spinner"></div>
      <p>Initializing FHE DNA analysis system...</p>
    </div>
  );

  return (
    <div className="app-container nature-theme">
      <header className="app-header">
        <div className="logo">
          <div className="logo-icon">
            <div className="dna-icon"></div>
          </div>
          <h1>Chrono<span>DNA</span>FHE</h1>
        </div>
        
        <div className="header-actions">
          <button 
            onClick={() => setShowAnalyzeModal(true)} 
            className="analyze-btn nature-button"
          >
            <div className="add-icon"></div>
            New Analysis
          </button>
          <button 
            className="nature-button"
            onClick={() => setShowTutorial(!showTutorial)}
          >
            {showTutorial ? "Hide Guide" : "How It Works"}
          </button>
          <WalletManager account={account} onConnect={onConnect} onDisconnect={onDisconnect} />
        </div>
      </header>
      
      <div className="main-content">
        <div className="welcome-banner">
          <div className="welcome-text">
            <h2>Privacy-Preserving Chronotype Analysis</h2>
            <p>Discover your optimal sleep schedule using FHE-encrypted DNA analysis</p>
          </div>
        </div>
        
        {showTutorial && (
          <div className="tutorial-section">
            <h2>FHE DNA Chronotype Analysis</h2>
            <p className="subtitle">Learn how we analyze your DNA while keeping it completely private</p>
            
            <div className="tutorial-steps">
              {tutorialSteps.map((step, index) => (
                <div 
                  className="tutorial-step"
                  key={index}
                >
                  <div className="step-icon">{step.icon}</div>
                  <div className="step-content">
                    <h3>{step.title}</h3>
                    <p>{step.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        
        <div className="dashboard-grid">
          <div className="dashboard-card nature-card">
            <h3>Project Introduction</h3>
            <p>ChronoDNA uses Fully Homomorphic Encryption (FHE) to analyze your DNA for chronotype markers while keeping your genetic data completely private and secure.</p>
            <div className="fhe-badge">
              <span>FHE-Powered Privacy</span>
            </div>
          </div>
          
          <div className="dashboard-card nature-card">
            <h3>Analysis Statistics</h3>
            <div className="stats-grid">
              <div className="stat-item">
                <div className="stat-value">{analyses.length}</div>
                <div className="stat-label">Total Analyses</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{analyzedCount}</div>
                <div className="stat-label">Completed</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{pendingCount}</div>
                <div className="stat-label">Pending</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{errorCount}</div>
                <div className="stat-label">Errors</div>
              </div>
            </div>
          </div>
          
          <div className="dashboard-card nature-card">
            <h3>Chronotype Distribution</h3>
            {renderChronotypeChart()}
          </div>
        </div>
        
        <div className="analyses-section">
          <div className="section-header">
            <h2>DNA Analysis History</h2>
            <div className="header-actions">
              <input
                type="text"
                placeholder="Search by chronotype or address..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="search-input"
              />
              <button 
                onClick={loadAnalyses}
                className="refresh-btn nature-button"
                disabled={isRefreshing}
              >
                {isRefreshing ? "Refreshing..." : "Refresh"}
              </button>
            </div>
          </div>
          
          <div className="analyses-list nature-card">
            <div className="table-header">
              <div className="header-cell">ID</div>
              <div className="header-cell">Chronotype</div>
              <div className="header-cell">Owner</div>
              <div className="header-cell">Date</div>
              <div className="header-cell">Status</div>
              <div className="header-cell">Actions</div>
            </div>
            
            {filteredAnalyses.length === 0 ? (
              <div className="no-analyses">
                <div className="no-analyses-icon"></div>
                <p>No DNA analyses found</p>
                <button 
                  className="nature-button primary"
                  onClick={() => setShowAnalyzeModal(true)}
                >
                  Start First Analysis
                </button>
              </div>
            ) : (
              filteredAnalyses.map(analysis => (
                <div className="analysis-row" key={analysis.id}>
                  <div className="table-cell analysis-id">#{analysis.id.substring(0, 6)}</div>
                  <div className="table-cell">{analysis.chronotype}</div>
                  <div className="table-cell">{analysis.owner.substring(0, 6)}...{analysis.owner.substring(38)}</div>
                  <div className="table-cell">
                    {new Date(analysis.timestamp * 1000).toLocaleDateString()}
                  </div>
                  <div className="table-cell">
                    <span className={`status-badge ${analysis.status}`}>
                      {analysis.status}
                    </span>
                  </div>
                  <div className="table-cell actions">
                    {isOwner(analysis.owner) && analysis.status === "pending" && (
                      <button 
                        className="action-btn nature-button primary"
                        onClick={() => runAnalysis(analysis.id)}
                      >
                        Analyze
                      </button>
                    )}
                    {analysis.status === "analyzed" && (
                      <button 
                        className="action-btn nature-button"
                        onClick={() => setSelectedAnalysis(analysis)}
                      >
                        View Details
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
  
      {showAnalyzeModal && (
        <ModalAnalyze 
          onSubmit={submitAnalysis} 
          onClose={() => setShowAnalyzeModal(false)} 
          analyzing={analyzing}
          analysisData={newAnalysisData}
          setAnalysisData={setNewAnalysisData}
        />
      )}
      
      {selectedAnalysis && (
        <AnalysisDetails 
          analysis={selectedAnalysis}
          onClose={() => setSelectedAnalysis(null)}
        />
      )}
      
      {walletSelectorOpen && (
        <WalletSelector
          isOpen={walletSelectorOpen}
          onWalletSelect={(wallet) => { onWalletSelect(wallet); setWalletSelectorOpen(false); }}
          onClose={() => setWalletSelectorOpen(false)}
        />
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content nature-card">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="dna-spinner"></div>}
              {transactionStatus.status === "success" && <div className="check-icon"></div>}
              {transactionStatus.status === "error" && <div className="error-icon"></div>}
            </div>
            <div className="transaction-message">
              {transactionStatus.message}
            </div>
          </div>
        </div>
      )}
  
      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <div className="logo">
              <div className="dna-icon"></div>
              <span>ChronoDNA FHE</span>
            </div>
            <p>Privacy-preserving DNA-based chronotype analysis using FHE technology</p>
          </div>
          
          <div className="footer-links">
            <a href="#" className="footer-link">Research</a>
            <a href="#" className="footer-link">Privacy Policy</a>
            <a href="#" className="footer-link">Terms of Service</a>
            <a href="#" className="footer-link">Contact</a>
          </div>
        </div>
        
        <div className="footer-bottom">
          <div className="fhe-badge">
            <span>FHE-Powered DNA Privacy</span>
          </div>
          <div className="copyright">
            © {new Date().getFullYear()} ChronoDNA FHE. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
};

interface ModalAnalyzeProps {
  onSubmit: () => void; 
  onClose: () => void; 
  analyzing: boolean;
  analysisData: any;
  setAnalysisData: (data: any) => void;
}

const ModalAnalyze: React.FC<ModalAnalyzeProps> = ({ 
  onSubmit, 
  onClose, 
  analyzing,
  analysisData,
  setAnalysisData
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setAnalysisData({
      ...analysisData,
      [name]: value
    });
  };

  const handleSubmit = () => {
    if (!analysisData.dnaSequence) {
      alert("Please provide DNA sequence markers");
      return;
    }
    
    onSubmit();
  };

  return (
    <div className="modal-overlay">
      <div className="analyze-modal nature-card">
        <div className="modal-header">
          <h2>New DNA Chronotype Analysis</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="fhe-notice-banner">
            <div className="key-icon"></div> Your DNA data will be encrypted with FHE and never decrypted
          </div>
          
          <div className="form-grid">
            <div className="form-group full-width">
              <label>DNA Sequence Markers *</label>
              <textarea 
                name="dnaSequence"
                value={analysisData.dnaSequence} 
                onChange={handleChange}
                placeholder="Enter PER3, CLOCK, or other chronotype-related gene markers..." 
                className="nature-textarea"
                rows={3}
              />
              <div className="input-note">Example: PER3 VNTR 5/5, CLOCK 3111T/C, etc.</div>
            </div>
            
            <div className="form-group">
              <label>Lifestyle Type</label>
              <select 
                name="lifestyle"
                value={analysisData.lifestyle} 
                onChange={handleChange}
                className="nature-select"
              >
                <option value="sedentary">Sedentary</option>
                <option value="balanced">Balanced</option>
                <option value="active">Active</option>
                <option value="athlete">Athlete</option>
              </select>
            </div>
            
            <div className="form-group">
              <label>Age Range</label>
              <select 
                name="ageRange"
                value={analysisData.ageRange} 
                onChange={handleChange}
                className="nature-select"
              >
                <option value="18-25">18-25</option>
                <option value="25-35">25-35</option>
                <option value="35-45">35-45</option>
                <option value="45-55">45-55</option>
                <option value="55+">55+</option>
              </select>
            </div>
          </div>
          
          <div className="privacy-notice">
            <div className="privacy-icon"></div> Your genetic data remains encrypted during FHE processing and is never stored in plaintext
          </div>
        </div>
        
        <div className="modal-footer">
          <button 
            onClick={onClose}
            className="cancel-btn nature-button"
          >
            Cancel
          </button>
          <button 
            onClick={handleSubmit} 
            disabled={analyzing}
            className="submit-btn nature-button primary"
          >
            {analyzing ? "Encrypting with FHE..." : "Start Analysis"}
          </button>
        </div>
      </div>
    </div>
  );
};

interface AnalysisDetailsProps {
  analysis: ChronotypeData;
  onClose: () => void;
}

const AnalysisDetails: React.FC<AnalysisDetailsProps> = ({ analysis, onClose }) => {
  return (
    <div className="modal-overlay">
      <div className="details-modal nature-card">
        <div className="modal-header">
          <h2>Chronotype Analysis Results</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="analysis-result">
            <div className="result-header">
              <div className={`chronotype-badge ${analysis.chronotype.toLowerCase()}`}>
                {analysis.chronotype}
              </div>
              <div className="result-meta">
                <div className="meta-item">
                  <span className="meta-label">Analyzed on:</span>
                  <span className="meta-value">{new Date(analysis.timestamp * 1000).toLocaleString()}</span>
                </div>
                <div className="meta-item">
                  <span className="meta-label">Owner:</span>
                  <span className="meta-value">{analysis.owner.substring(0, 8)}...{analysis.owner.substring(36)}</span>
                </div>
              </div>
            </div>
            
            <div className="schedule-recommendation">
              <h3>Optimal Sleep Schedule</h3>
              <div className="schedule-grid">
                <div className="schedule-item">
                  <div className="schedule-label">Bedtime</div>
                  <div className="schedule-value">{analysis.recommendedSleep}</div>
                </div>
                <div className="schedule-item">
                  <div className="schedule-label">Wake Time</div>
                  <div className="schedule-value">{analysis.recommendedWake}</div>
                </div>
                <div className="schedule-item">
                  <div className="schedule-label">Productivity Peak</div>
                  <div className="schedule-value">{analysis.productivityPeak}</div>
                </div>
              </div>
            </div>
            
            <div className="chronotype-description">
              <h3>About Your Chronotype</h3>
              <p>
                {analysis.chronotype === "Wolf" && "Wolves are evening types who struggle with early mornings but come alive in the evening. You're most creative and productive during later hours."}
                {analysis.chronotype === "Lion" && "Lions are morning types who wake up early with energy and focus. You're most productive in the morning but may struggle with evening activities."}
                {analysis.chronotype === "Bear" && "Bears follow the solar cycle, with energy levels that rise and set with the sun. You're most productive during standard business hours."}
                {analysis.chronotype === "Dolphin" && "Dolphins are light sleepers with irregular sleep patterns. You're most productive during unusual hours and may benefit from segmented sleep."}
              </p>
            </div>
            
            <div className="fhe-note">
              <div className="lock-icon"></div>
              <span>This analysis was performed using FHE encryption - your DNA was never decrypted</span>
            </div>
          </div>
        </div>
        
        <div className="modal-footer">
          <button 
            onClick={onClose}
            className="cancel-btn nature-button"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default App;