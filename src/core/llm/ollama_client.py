import requests
from typing import Optional, Union
from llama_index.llms.ollama import Ollama

class OllamaClient:
    """
    A persistent client for Ollama that maintains a single model instance with model management capabilities.
    """      
    def __init__(
        self,
        model: str = "llama2:latest",
        request_timeout: float = 120.0,
        temperature: float = 0.0,
        top_k: int = 50,
        top_p: float = 0.9,
        max_tokens: int = 256,
        base_url: str = "http://localhost:11434"
    ):
        """Initialize the Ollama client with model configuration."""
        self._validate_params(
            model, request_timeout, temperature, 
            top_k, top_p, max_tokens, base_url
        )
        
        self.model_name = model
        self.base_url = base_url
        self.request_timeout = request_timeout
        # Store completion parameters
        self.completion_params = {
            "temperature": temperature,
            "top_k": top_k,
            "top_p": top_p,
            "num_predict": max_tokens
        }
        
        self._initialize_model()

    def _initialize_model(self):
        """Initialize or reinitialize the model with current parameters."""
        self.llm = Ollama(
            model=self.model_name,
            base_url=self.base_url,
            request_timeout=self.request_timeout,
            completion_kwargs=self.completion_params
        )

    def _validate_params(self, model: str, request_timeout: float, 
                        temperature: float, top_k: int, 
                        top_p: float, max_tokens: int, base_url: str) -> None:
        """Validate initialization parameters."""
        if not isinstance(model, str) or not model.strip():
            raise ValueError("Model name must be a non-empty string")

        if not isinstance(request_timeout, (int, float)) or request_timeout <= 0:
            raise ValueError("request_timeout must be a positive number")

        if not isinstance(temperature, (int, float)) or not 0 <= temperature <= 1:
            raise ValueError("Temperature must be between 0 and 1")

        if not isinstance(top_k, int) or not 1 <= top_k <= 100:
            raise ValueError("top_k must be an integer between 1 and 100")

        if not isinstance(top_p, (int, float)) or not 0 <= top_p <= 1:
            raise ValueError("top_p must be between 0 and 1")

        if not isinstance(max_tokens, int) or max_tokens < 1:
            raise ValueError("max_tokens must be a positive integer")

        if not isinstance(base_url, str) or not base_url.strip():
            raise ValueError("base_url must be a non-empty string")

    def query(self, prompt: str) -> str:
        """
        Query the model with a prompt.

        Parameters:
            prompt (str): The input prompt for the model.

        Returns:
            str: The generated response text.

        Raises:
            ValueError: If prompt is invalid.
            ConnectionError: If cannot connect to Ollama server.
            Exception: For other LLM query failures.
        """
        if not isinstance(prompt, str) or not prompt.strip():
            raise ValueError("Prompt must be a non-empty string")

        try:
            response = self.llm.complete(prompt)
            
            if not response or not isinstance(response.text, str):
                raise Exception("Invalid response format from Ollama")

            return response.text

        except ConnectionError as e:
            raise ConnectionError(f"Failed to connect to Ollama server: {str(e)}")
        except Exception as e:
            raise Exception(f"LLM query failed: {str(e)}")
    
    def update_params(self, temperature: Optional[float] = None,
                     top_k: Optional[int] = None,
                     top_p: Optional[float] = None,
                     max_tokens: Optional[int] = None) -> None:
        """Update generation parameters and reinitialize the model."""
        if temperature is not None:
            if not 0 <= temperature <= 1:
                raise ValueError("Temperature must be between 0 and 1")
            self.completion_params["temperature"] = temperature
            
        if top_k is not None:
            if not isinstance(top_k, int) or not 1 <= top_k <= 100:
                raise ValueError("top_k must be an integer between 1 and 100")
            self.completion_params["top_k"] = top_k
            
        if top_p is not None:
            if not 0 <= top_p <= 1:
                raise ValueError("top_p must be between 0 and 1")
            self.completion_params["top_p"] = top_p
            
        if max_tokens is not None:
            if not isinstance(max_tokens, int) or max_tokens < 1:
                raise ValueError("max_tokens must be a positive integer")
            self.completion_params["num_predict"] = max_tokens

        # Reinitialize the model with updated parameters
        self._initialize_model()

    def unload_model(self) -> bool:
        """
        Unload the current model from Ollama to free up resources.
        
        Returns:
            bool: True if successful, False otherwise
        """
        
        try:
            # New Ollama API endpoint for removing a model
            url = f"{self.base_url}/api/remove"
            
            response = requests.delete(
                url,
                json={"name": self.model_name}
            )
            
            if response.status_code in [200, 404]:  # 404 means model already unloaded
                return True
                
            print(f"Failed to unload model: {response.text}")
            return False
                
        except Exception as e:
            print(f"Error unloading model: {str(e)}")
            return False

    def change_model(self, new_model: str) -> bool:
        """
        Change to a different model, unloading the current one first.
        
        Parameters:
            new_model (str): Name of the new model to load
            
        Returns:
            bool: True if successful, False otherwise
        """

        try:
            # First, unload the current model
            self.unload_model()
            
            # Update the model name
            self.model_name = new_model
            
            # Reinitialize with the new model
            self._initialize_model()
            
            return True
            
        except Exception as e:
            print(f"Error changing model: {str(e)}")
            return False

    def __del__(self):
        """Destructor to ensure model is unloaded when the client is deleted."""
        try:
            self.unload_model()
        except:
            pass