// swalConfig.js
import Swal from 'sweetalert2';
import 'sweetalert2/dist/sweetalert2.min.css';

Swal.mixin({
  confirmButtonColor: '#3085d6',
  cancelButtonColor: '#d33',
  allowOutsideClick: false,
  customClass: {
    confirmButton: 'btn btn-success',
    cancelButton: 'btn btn-danger'
  }
});