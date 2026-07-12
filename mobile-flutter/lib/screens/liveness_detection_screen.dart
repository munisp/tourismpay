import 'dart:convert';
import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:camera/camera.dart';
import '../services/api_service.dart';

/// Liveness Detection Screen
/// Mirrors the PWA LivenessCameraCapture for mobile parity.
/// Captures frames and sends to the server for passive liveness analysis.
class LivenessDetectionScreen extends StatefulWidget {
  const LivenessDetectionScreen({super.key});

  @override
  State<LivenessDetectionScreen> createState() => _LivenessDetectionScreenState();
}

class _LivenessDetectionScreenState extends State<LivenessDetectionScreen> {
  final _api = ApiService();
  CameraController? _cameraController;
  bool _isProcessing = false;
  String _instruction = 'Position your face in the center of the frame';
  String _status = 'idle'; // idle, capturing, verifying, passed, failed
  String? _challengeId;
  int _framesSubmitted = 0;
  String? _error;

  @override
  void initState() {
    super.initState();
    _initCamera();
    _startLivenessSession();
  }

  Future<void> _initCamera() async {
    final cameras = await availableCameras();
    final frontCamera = cameras.firstWhere(
      (c) => c.lensDirection == CameraLensDirection.front,
      orElse: () => cameras.first,
    );

    _cameraController = CameraController(
      frontCamera,
      ResolutionPreset.medium,
      enableAudio: false,
    );

    await _cameraController!.initialize();
    if (mounted) setState(() {});
  }

  Future<void> _startLivenessSession() async {
    try {
      final result = await _api.post('/api/trpc/kyc.startLiveness', {});
      if (result != null && result['result'] != null) {
        final data = result['result']['data'];
        setState(() {
          _challengeId = data['challengeId'];
          _instruction = data['instruction'] ?? 'Look straight at the camera';
          _status = 'capturing';
        });
      }
    } catch (e) {
      setState(() {
        _error = 'Failed to start liveness session: $e';
        _status = 'failed';
      });
    }
  }

  Future<void> _captureAndSubmitFrame() async {
    if (_isProcessing || _cameraController == null || _challengeId == null) return;
    setState(() => _isProcessing = true);

    try {
      final image = await _cameraController!.takePicture();
      final bytes = await image.readAsBytes();
      final base64Frame = base64Encode(bytes);

      final result = await _api.post('/api/trpc/kyc.submitLivenessFrame', {
        'challengeId': _challengeId,
        'frame': base64Frame,
      });

      _framesSubmitted++;

      if (result != null && result['result'] != null) {
        final data = result['result']['data'];
        if (data['passed'] == true) {
          setState(() {
            _status = 'passed';
            _instruction = 'Liveness verified successfully!';
          });
        } else if (data['instruction'] != null) {
          setState(() => _instruction = data['instruction']);
        }
      }
    } catch (e) {
      setState(() => _error = 'Frame submission failed: $e');
    } finally {
      setState(() => _isProcessing = false);
    }
  }

  @override
  void dispose() {
    _cameraController?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Liveness Verification')),
      body: Column(
        children: [
          if (_cameraController != null && _cameraController!.value.isInitialized)
            AspectRatio(
              aspectRatio: _cameraController!.value.aspectRatio,
              child: CameraPreview(_cameraController!),
            )
          else
            const SizedBox(
              height: 300,
              child: Center(child: CircularProgressIndicator()),
            ),
          const SizedBox(height: 16),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 24),
            child: Text(
              _instruction,
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.titleMedium,
            ),
          ),
          const SizedBox(height: 8),
          if (_error != null)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 24),
              child: Text(_error!, style: const TextStyle(color: Colors.red)),
            ),
          const SizedBox(height: 24),
          if (_status == 'capturing')
            ElevatedButton.icon(
              onPressed: _isProcessing ? null : _captureAndSubmitFrame,
              icon: _isProcessing
                  ? const SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.camera),
              label: Text(_isProcessing ? 'Verifying...' : 'Capture Frame'),
            ),
          if (_status == 'passed')
            Column(
              children: [
                const Icon(Icons.check_circle, color: Colors.green, size: 64),
                const SizedBox(height: 8),
                ElevatedButton(
                  onPressed: () => Navigator.of(context).pop(true),
                  child: const Text('Continue'),
                ),
              ],
            ),
          if (_status == 'failed')
            ElevatedButton(
              onPressed: () {
                setState(() {
                  _status = 'idle';
                  _error = null;
                  _framesSubmitted = 0;
                });
                _startLivenessSession();
              },
              child: const Text('Retry'),
            ),
          const SizedBox(height: 8),
          Text('Frames submitted: $_framesSubmitted',
              style: Theme.of(context).textTheme.bodySmall),
        ],
      ),
    );
  }
}
